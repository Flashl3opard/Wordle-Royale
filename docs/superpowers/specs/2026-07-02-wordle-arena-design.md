# Wordle Arena — Design Spec

Date: 2026-07-02
Status: Approved for implementation (full build, single pass)

## Summary

A real-time multiplayer Wordle game, guest-only (no accounts), up to 8 players per room. Next.js 16 (App Router, TypeScript strict) on Vercel. Firebase Firestore is the source of truth for game state, synced to clients via `onSnapshot`. Firebase Realtime Database provides connection presence. All game logic (word selection, guess validation, scoring, round lifecycle) runs server-side in Route Handlers via the Firebase Admin SDK — the client never writes game state directly.

## Tech stack

- Next.js 16.2.10 App Router, TypeScript strict, Tailwind CSS v4
- Firebase: Firestore (game state), Realtime Database (presence only), Admin SDK server-side, client SDK for read-only `onSnapshot`
- Zustand (client state mirroring Firestore snapshots)
- Zod (validate every client→server payload)
- Framer Motion (tile flips, leaderboard re-sort, confetti)
- No auth: nickname + client-generated `playerId` stored in `localStorage` per room code

## Next.js 16 constraints that affect implementation

- Route Handler `params` are `Promise<T>` — every handler must `await` them (async Request APIs, breaking in v16).
- No `middleware.ts`; if a network boundary is ever needed it's `proxy.ts` (not used in this project — no such requirement).
- Node.js 20.9+ required.

## Data model (Firestore)

```
rooms/{code}
  status: "lobby" | "in_round" | "round_end" | "finished"
  hostPlayerId: string
  roundCount: number            // default 6, host-editable pre-start
  roundDurationMs: number       // default 30000, host-editable pre-start
  currentRound: number          // 0 in lobby
  createdAt: Timestamp
  expiresAt: Timestamp          // createdAt + 4h; cleanup sweep deletes past this

rooms/{code}/players/{playerId}
  nickname: string
  isHost: boolean
  connected: boolean            // mirrored from RTDB presence
  totalScore: number
  joinedAt: Timestamp
  lastGuessAt: Timestamp | null // rate-limit guard

rooms/{code}/rounds/{roundNumber}
  secretWord: string            // never sent to client while round is active
  startedAt: Timestamp
  roundEndsAt: Timestamp        // server-authoritative deadline
  status: "active" | "ended"
  solvedBy: string[]            // playerIds who solved, in order (for scoring reference)

rooms/{code}/rounds/{roundNumber}/guesses/{playerId}
  attempts: Array<{
    word: string
    tiles: Array<"green" | "yellow" | "gray">
    pointsEarned: number
    submittedAt: Timestamp
  }>
  solved: boolean
  totalPointsThisRound: number
```

Realtime Database (presence only):
```
/presence/{roomCode}/{playerId}: { online: boolean, lastSeen: number }
```

## Security rules

- Firestore: all client writes denied. Reads on `rooms/{code}` and subcollections allowed unauthenticated (guest app, no accounts) — mitigated by unguessable 6-char codes and a 4h TTL, not by auth. Guess subcollection reads are further restricted at the query level: clients only ever construct a query for their own `playerId` doc, but since Firestore rules can't see "intent," the rule allows read of `rounds/{n}/guesses/{playerId}` for any caller. This is an accepted MVP limitation (documented, not fixed) since there's no auth to key a rule on; noted as a known gap.
- Realtime Database: clients may only write to their own `/presence/{roomCode}/{myPlayerId}` path (enforced via a rule keyed on a client-generated presence token passed at connect time), read the whole `/presence/{roomCode}` subtree.

## API routes (Admin SDK, Zod-validated on every input)

- `POST /api/rooms` — create room + host player, returns `{code, playerId}`
- `POST /api/rooms/[code]/join` — validate nickname, room status, capacity (<8); returns `{playerId}`
- `POST /api/rooms/[code]/leave` — explicit leave; promotes next-earliest-joined player to host if host left; deletes room if last player leaves
- `PATCH /api/rooms/[code]/settings` — host-only, lobby-only: update `roundCount` / `roundDurationMs`
- `POST /api/rooms/[code]/start` — host-only: transitions lobby → in_round, creates round 1 doc with a random secret from `answers.ts`, sets `roundEndsAt`
- `POST /api/rooms/[code]/guess` — validates word against `valid-guesses.ts`, computes tiles + points server-side, appends to the player's guess doc, checks rate limit (`lastGuessAt` within 400ms → reject), checks if this was the round's final required guess (all players solved or maxed out) and finalizes the round if so
- `POST /api/rooms/[code]/round/check` — idempotent: if `now >= roundEndsAt` and round is still `active`, finalizes it (reveals word, tallies scores, freezes-then-unfreezes leaderboard by flipping room status to `round_end`); no-op otherwise. Called by any client whose local clock reaches the deadline.
- `POST /api/rooms/[code]/round/next` — host-only (or auto-triggered after a short reveal delay): advances `currentRound`, starts next round, or transitions to `finished` after the last round
- `POST /api/rooms/[code]/reset` — host-only, `finished` → `lobby`: zeroes scores, keeps room/players ("Play Again")

## Scoring (pure functions in `lib/game/scoring.ts`)

- Yellow tile = 5 pts, Green tile = 10 pts, solving = +50 bonus
- Speed multiplier per guess: `clamp(1 + timeRemainingMs / roundDurationMs, 1, 2)`, applied to that guess's total (tile points + solve bonus if applicable)
- Points computed and banked per guess, not just on solve

## Concurrency note

Round finalization can be triggered from two places (`/guess` when the last player finishes, and `/round/check` on timer expiry) and multiple clients may call `/round/check` at nearly the same moment. Finalization runs inside a Firestore transaction that reads the round doc's `status` first and no-ops if it's already `"ended"`, so only one caller's write wins regardless of race.

## Round flow

1. Server picks a secret word from `answers.ts`, creates round doc with `roundEndsAt = now + roundDurationMs`
2. Clients render countdown purely from `roundEndsAt` (no client-side timer authority)
3. Each guess: client → `POST /guess` → server validates dictionary membership (reject without consuming an attempt if invalid) → computes tiles/points → writes to `rounds/{n}/guesses/{playerId}` → client's `onSnapshot` on **only their own** guess doc receives the update (never subscribes to others' guess docs, preventing copying)
4. Round ends on first of: timer expiry (via `/round/check`), or all players solved/exhausted 6 guesses (checked inline in `/guess`)
5. On end: room status → `round_end`, round doc `status` → `ended`, secret word now included in the round doc read (since rules don't gate by round status, the client is trusted not to peek — acceptable given no adversarial stakes; documented as MVP gap alongside the guesses-read gap above)

## Leaderboard & multi-round loop

- Player list component reads `totalScore` from the players subcollection but the UI freezes its displayed order during `in_round`, re-sorting only on transition to `round_end` (Framer Motion layout animation)
- Per-round breakdown shown from the guesses doc's `totalPointsThisRound`
- After final round, room status → `finished`, podium screen (1st/2nd/3rd, confetti for 1st) from final `totalScore` ranking

## Presence & disconnect handling

- On joining, client connects to RTDB `/presence/{code}/{playerId}` and registers `onDisconnect()` to flip `online: false`
- A small server-side listener (Cloud Function alternative: since this project has no Cloud Functions deployment target, presence is mirrored into Firestore via a Route Handler the client calls once after establishing the RTDB connection, `POST /api/rooms/[code]/presence`, plus the client re-syncs `connected` optimistically; a periodic client-driven reconciliation call covers the disconnect-flip case since there's no server push from RTDB→Firestore without Cloud Functions) — **flagged limitation**: true server-verified disconnect mirroring normally needs a Cloud Function trigger on RTDB writes; without deploying one (out of scope — Vercel-only deployment target per brief), disconnect detection is client-observed (via presence subtree reads) rather than server-authoritative. Documented as an accepted MVP gap.
- Host disconnecting mid-round does not interrupt the round (server logic doesn't depend on host being connected, only on host-only actions like starting rounds)

## Room cleanup

- `expiresAt` set at creation (`createdAt + 4h`)
- No Cloud Scheduler (Vercel-only deployment) — cleanup happens lazily: any room-fetch route checks `expiresAt` and deletes-on-read if past expiry, returning "room not found" to the caller

## Word lists

- `lib/words/answers.ts`: curated common-word list sourced from the widely-mirrored original NYT Wordle answer list (~2,315 words), family-friendly by construction (it's the actual shipped Wordle answers)
- `lib/words/valid-guesses.ts`: the corresponding allowed-guesses list (~10,657 words)
- If fetching these fails during implementation, falls back to a ~200-word scaffold with an explicit TODO — will be called out, not silently substituted

## Testing

- Unit tests: `lib/game/tiles.ts` (tile-color computation incl. duplicate-letter edge cases), `lib/game/scoring.ts` (multiplier clamping, bonus timing), `lib/game/validation.ts` (Zod accept/reject), `lib/game/roomCode.ts` (charset/uniqueness)
- No E2E test harness in this pass (manual multi-tab verification instead) — flagged as a scope cut, not an oversight

## Explicit gaps / accepted MVP limitations (called out per brief's request)

1. Firestore security rules can't key on "this is MY guess doc" without auth — guess docs are readable by any client with the room code, even though the UI never queries others'. Mitigated by short-lived, unguessable room codes.
2. Presence disconnect detection is client-reconciled, not Cloud-Function-verified (no Cloud Functions in a Vercel-only deploy).
3. Room cleanup is lazy (delete-on-read past `expiresAt`), not a scheduled sweep, since Vercel Cron's minimum interval doesn't suit this and no external scheduler is in scope.
4. No automated E2E tests.
