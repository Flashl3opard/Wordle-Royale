# Single-Round Mode + Neo-Brutalist Redesign

Date: 2026-07-03

## Summary

Three changes to the multiplayer Wordle game:

1. Remove the multi-round system — every game is exactly one round.
2. Add a game mode choice: **Timed** (existing countdown, host sets duration) or **Infinite** (no clock, round ends when all players finish).
3. Redesign the UI in a "Concrete & Rust" neo-brutalist style: thick black borders, hard offset drop-shadows, condensed-impact uppercase headlines, warm off-white base with burnt-orange/mustard accents.
4. Add a toast notification when a connected player disconnects mid-game.

## 1. Single Round

The multi-round machinery is removed entirely, not just defaulted to 1:

- **`RoomDoc`** (`lib/game/types.ts`): drop `roundCount` and `currentRound`. Keep `roundDurationMs` (used only in Timed mode) and add `mode: "timed" | "infinite"`.
- **`roomSettingsSchema`** (`lib/game/validation.ts`): drop the `roundCount` field (1–20 range) entirely. Keep `roundDurationMs` validation (10s–120s) but make it conditionally required — only validated/used when `mode === "timed"`.
- **`app/api/rooms/[code]/round/next/route.ts`**: deleted. There is no "next round" — after the single round ends, the game goes straight to `finished`.
- **`app/api/rooms/[code]/start/route.ts`**: creates round `"1"` as today, but the room's `status` transitions directly from `"round_end"` to `"finished"` when that round ends (no intermediate advance step). The `finalizeRoundIfNeeded` helper (`lib/game/round-lifecycle.ts`) sets room status to `"finished"` instead of `"round_end"` once the single round ends, since there's nowhere else to go.
- **`RoundEnd.tsx`**: deleted. The room state machine in `app/room/[code]/page.tsx` goes `Lobby → RoundPlay → Podium` (drop the `RoundEnd` branch). The secret-word reveal that `RoundEnd` used to show is folded into `Podium` (see UI section).
- **`app/api/rooms/[code]/round/check/route.ts`**: kept as-is (still needed to finalize a timed round when the clock runs out) but its finalize call now leads straight to `"finished"`.
- **Round-count references removed** from `Lobby.tsx`'s settings form.

## 2. Timed vs Infinite Mode

- **Where it's picked**: `Lobby.tsx` settings form gets a mode toggle (Timed / Infinite) alongside the existing duration control. Selecting Infinite hides the duration slider; selecting Timed shows it (same 10–120s range, default 30s as today).
- **Data model**: `RoomDoc.mode: "timed" | "infinite"`, set at room creation (`app/api/rooms/route.ts`, default `"timed"`) and editable in the lobby via the existing `PATCH /api/rooms/[code]/settings` route, same host-only/lobby-only constraints as today.
- **Round creation** (`start/route.ts`): when `mode === "infinite"`, the created `RoundDoc` gets `roundEndsAt: null` instead of `now + roundDurationMs`.
- **`RoundDoc.roundEndsAt`** becomes `number | null` in `lib/game/types.ts`.
- **Client timer** (`Timer.tsx`, used in `RoundPlay.tsx`): when `roundEndsAt` is `null`, render an "∞" / infinite-mode indicator (e.g. a pulsing icon in place of the countdown bar) instead of a countdown, and skip the `onExpire` polling entirely.
- **Server-side expiry checks** (`guess/route.ts`, `round/check/route.ts`): skip the `now >= roundEndsAt` check when `roundEndsAt` is `null` — a null deadline never expires by time.
- **Scoring** (`lib/game/scoring.ts`): `calculateSpeedMultiplier` receives `timeRemainingMs: number | null`. When `null` (infinite mode), return a fixed multiplier of `1` (flat scoring — tile points + solve bonus only, no speed bonus). Timed mode behavior is unchanged.
- **Round end condition**:
  - Timed mode: unchanged — clock hits zero (`round/check`) or all players finish early (`allPlayersDone`, called from `guess/route.ts`).
  - Infinite mode: **only** `allPlayersDone` — reused as-is from `lib/game/round-lifecycle.ts`. No host "force end" control (per your choice — all-players-done is the sole trigger for the MVP).

## 3. Neo-Brutalist UI — "Concrete & Rust"

Confirmed via visual mockups (see `.superpowers/brainstorm/1519-1783078160/content/` for the reference screens shown during brainstorming).

**Design tokens** (introduce as CSS custom properties in `app/globals.css`, mapped into Tailwind v4's `@theme inline` block — replacing the current unused light/dark `--background`/`--foreground` pair):

- Base surface: warm off-white / concrete, `#F2F0E9`
- Ink: `#000000` (borders, text, shadows use pure black — brutalism doesn't do soft grays for structure)
- Accent primary (wrong-position / warning / CTA shadow): burnt orange `#FF4B1F`
- Accent secondary (correct-position alternate / highlight): mustard `#FFC53D`
- Correct tile: keep a green, but pick one consistent with the palette (e.g. a desaturated olive-green rather than default Tailwind `green-600`, to avoid clashing with the warm palette) — exact hex to be picked during implementation to read well against `#F2F0E9`.
- Structural language used everywhere: `border: 3-4px solid black`, offset hard shadow (`box-shadow: 4px 4px 0 #000` or accent-colored shadow, no blur), no rounded corners (or minimal 2-4px max), chunky uppercase labels with tight letter-spacing.

**Typography**: Condensed Impact style for headlines/scores/room codes — a tall, tight, uppercase display face (e.g. `Anton`, `Archivo Black`, or similar condensed/black weight web font — pick one that self-hosts cleanly or loads via `next/font`). Body text and inputs stay in a plain readable sans (system font stack) for legibility; the brutalist treatment is concentrated in headings, buttons, badges, and the tile/keyboard chrome, not paragraph text.

**Screens affected** (all components under `components/`, restyled in place — no new component files needed beyond what's listed in section 4):

- `app/page.tsx` (home) — nickname input + create/join, restyled with the new tokens.
- `Lobby.tsx` — room code display, player list, mode toggle + settings form, start button.
- `JoinInline.tsx` — nickname entry restyled.
- `RoundPlay.tsx` / `GameBoard.tsx` / `Keyboard.tsx` / `Timer.tsx` — tile colors remapped to the new palette, timer bar restyled (or replaced with the infinite indicator), keyboard keys get the hard-shadow button treatment.
- `Podium.tsx` — becomes the sole end-game screen (absorbs the secret-word reveal previously in `RoundEnd.tsx`), restyled podium blocks with offset shadows, confetti kept.
- `Leaderboard.tsx` — restyled list treatment, still shown on `Podium`.
- `app/layout.tsx` — swap in the new display font via `next/font`, update page metadata title away from the default "Create Next App".

No new pages/routes are needed for the visual redesign — it's a styling pass over existing components plus the structural simplification from section 1.

## 4. Disconnect Toast

- **Signal source**: `PlayerDoc.connected` (`lib/game/types.ts:26`) is already mirrored into Firestore by the existing RTDB presence system (per the recent "RTDB presence tracking and Firestore connected-status mirroring" work). The room subscription hook (`hooks/useRoomSubscription.ts`) already receives live updates to this field — no new backend work needed.
- **New client-side piece**: a small toast/notification system.
  - Track previous `connected` state per player (e.g. a `useRef<Record<string, boolean>>` or similar) inside a new lightweight hook, e.g. `hooks/usePresenceToasts.ts`, that diffs the incoming player list on each `useRoomSubscription` update.
  - When a player's `connected` flips `true → false`, push a toast: `"<nickname> left the room"`.
  - (Optional, not required by your ask but symmetrical and cheap: when a player's `connected` flips `false → true` after having been in the room, a "`<nickname> reconnected`" toast — include this since the same diffing logic produces it for free. Flag as optional during implementation.)
  - Render via a minimal self-built toast component in the brutalist style (small offset-shadow card, auto-dismiss after ~4s, stack in a corner) — no new dependency needed for something this small.
  - Mounted once at the room page level (`app/room/[code]/page.tsx`) so it fires regardless of which sub-screen (`Lobby`/`RoundPlay`/`Podium`) is active.
- **Scope guard**: only fire for players who were already `connected: true` at some point in this session (i.e. skip the initial mount where every player's "previous" state is unknown) — otherwise everyone would get a spurious "left" toast on page load before the diff baseline is established.

## Out of Scope

- No host "force end round" control in infinite mode.
- No reconnection grace period / "waiting for player" blocking behavior — the toast is informational only, gameplay continues.
- No changes to word list, guess validation, or the core Wordle tile-matching logic.
- No changes to Firebase security rules (already fixed/deployed).
