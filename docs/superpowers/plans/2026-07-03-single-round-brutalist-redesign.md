# Single-Round Mode + Neo-Brutalist Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the game to a single round, add a Timed/Infinite mode toggle, restyle the entire UI in a "Concrete & Rust" neo-brutalist look, and add a toast when a player disconnects.

**Architecture:** Backend changes touch `lib/game/types.ts` (data shapes), `lib/game/validation.ts` (schemas), `lib/game/scoring.ts` (flat scoring for infinite mode), `lib/game/round-lifecycle.ts` (finalize goes straight to `finished`), and the `app/api/rooms/**` routes (drop round-count/next-round, add mode). Frontend changes restyle every existing component in place with a new brutalist token set in `app/globals.css`, add a `mode` toggle to `Lobby.tsx`, remove `RoundEnd.tsx`, fold its reveal into `Podium.tsx`, and add a new `hooks/usePresenceToasts.ts` + `components/Toast.tsx` for disconnect notifications.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4 (CSS-first `@theme`), Zustand, Firebase (Admin SDK server-side, client SDK for realtime reads), Zod, Vitest, framer-motion, canvas-confetti.

## Global Constraints

- Single round only — no round count setting, no "next round" flow (per spec section 1).
- `mode: "timed" | "infinite"` on `RoomDoc`; infinite mode has `roundEndsAt: null`, flat scoring (multiplier fixed at 1), and ends only via `allPlayersDone` (spec section 2).
- Timed mode keeps existing 10s–120s duration range and speed-multiplier scoring, unchanged.
- Visual design tokens: base `#F2F0E9`, ink `#000000`, accent primary `#FF4B1F` (burnt orange), accent secondary `#FFC53D` (mustard); structural language is `3-4px solid black` borders, hard offset shadows (no blur), minimal/no border-radius, uppercase chunky labels (spec section 3).
- Headline/display font: Condensed Impact style (e.g. `Anton` via `next/font/google`); body text stays in a plain readable sans (spec section 3).
- Disconnect toast reuses existing `PlayerDoc.connected` field — no new backend/presence work (spec section 4). Also fire a "reconnected" toast symmetrically.
- No host "force end round" control. No reconnection grace period. No changes to word list, tile-matching logic, or Firebase security rules.

---

## Task 1: Data model — drop round count, add mode

**Files:**
- Modify: `lib/game/types.ts`
- Modify: `lib/game/validation.ts`
- Test: `lib/game/validation.test.ts`

**Interfaces:**
- Produces: `RoomDoc` without `roundCount`/`currentRound`, with `mode: "timed" | "infinite"`. `RoundDoc.roundEndsAt: number | null`. `roomSettingsSchema` validates `mode` and conditionally requires `roundDurationMs` only when `mode === "timed"`.

- [ ] **Step 1: Update `RoomDoc` and `RoundDoc` types**

Edit `lib/game/types.ts`:

```typescript
export type TileColor = "green" | "yellow" | "gray";

export interface GuessAttempt {
  word: string;
  tiles: TileColor[];
  pointsEarned: number;
  submittedAt: number;
}

export type RoomStatus = "lobby" | "in_round" | "round_end" | "finished";
export type GameMode = "timed" | "infinite";

export interface RoomDoc {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  mode: GameMode;
  roundDurationMs: number;
  createdAt: number;
  expiresAt: number;
}

export interface PlayerDoc {
  nickname: string;
  isHost: boolean;
  connected: boolean;
  totalScore: number;
  joinedAt: number;
  lastGuessAt: number | null;
}

export interface RoundDoc {
  roundNumber: number;
  secretWord: string;
  startedAt: number;
  roundEndsAt: number | null;
  status: "active" | "ended";
  solvedBy: string[];
}

export interface GuessDoc {
  attempts: GuessAttempt[];
  solved: boolean;
  totalPointsThisRound: number;
}
```

Note: `roundCount` and `currentRound` are removed from `RoomDoc`. `roundNumber` stays on `RoundDoc` (always `1`) since the round subcollection doc still needs an id and the field is cheap to keep for debugging/display.

- [ ] **Step 2: Write failing tests for the updated `roomSettingsSchema`**

Replace the `roomSettingsSchema` describe block in `lib/game/validation.test.ts`:

```typescript
describe("roomSettingsSchema", () => {
  it("accepts timed mode with a duration in bounds", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 30000 })
        .success
    ).toBe(true);
  });

  it("accepts infinite mode without a duration", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "infinite" }).success
    ).toBe(true);
  });

  it("rejects timed mode with a duration below 10s", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 5000 })
        .success
    ).toBe(false);
  });

  it("rejects timed mode with no duration at all", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed" }).success
    ).toBe(false);
  });

  it("rejects an invalid mode value", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "endless", roundDurationMs: 30000 })
        .success
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `roomSettingsSchema` still requires `roundCount` and has no `mode` field, so several new assertions fail (accepts-infinite and rejects-no-duration cases mismatch).

- [ ] **Step 4: Update `roomSettingsSchema` (and drop `roundNextSchema`)**

Edit `lib/game/validation.ts` — replace the `roomSettingsSchema` block and delete `roundNextSchema` (no longer used once Task 4 removes the round/next route):

```typescript
export const roomSettingsSchema = z
  .object({
    playerId: z.string().min(1),
    mode: z.enum(["timed", "infinite"]),
    roundDurationMs: z.number().int().min(10000).max(120000).optional(),
  })
  .refine((data) => data.mode !== "timed" || data.roundDurationMs !== undefined, {
    message: "roundDurationMs is required for timed mode",
    path: ["roundDurationMs"],
  });
```

Delete the `roundNextSchema` export entirely (its only consumer, `app/api/rooms/[code]/round/next/route.ts`, is deleted in Task 4).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: PASS — all `roomSettingsSchema` tests green, all other existing test files unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/game/types.ts lib/game/validation.ts lib/game/validation.test.ts
git commit -m "feat: replace round-count settings with timed/infinite mode"
```

---

## Task 2: Scoring — flat multiplier for infinite mode

**Files:**
- Modify: `lib/game/scoring.ts`
- Test: `lib/game/scoring.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `calculateSpeedMultiplier(timeRemainingMs: number | null, roundDurationMs: number): number` — returns `1` when `timeRemainingMs` is `null`. `calculateGuessPoints` accepts `timeRemainingMs: number | null` in `ScoreGuessInput`.

- [ ] **Step 1: Write failing tests for null time remaining**

Add to `lib/game/scoring.test.ts` (inside the existing `describe("calculateSpeedMultiplier", ...)` block, as new `it` cases):

```typescript
  it("returns a flat 1.0x when time remaining is null (infinite mode)", () => {
    expect(calculateSpeedMultiplier(null, 30000)).toBe(1);
  });
```

And inside `describe("calculateGuessPoints", ...)`:

```typescript
  it("infinite mode: solved guess with all-green tiles nets flat 150 (no speed bonus)", () => {
    const points = calculateGuessPoints({
      tiles: ["green", "green", "green", "green", "green"],
      solved: true,
      timeRemainingMs: null,
      roundDurationMs: 30000,
    });
    expect(points).toBe(150);
  });

  it("infinite mode: partial yellow guess still banks flat points", () => {
    const points = calculateGuessPoints({
      tiles: ["yellow", "yellow", "gray", "gray", "gray"],
      solved: false,
      timeRemainingMs: null,
      roundDurationMs: 30000,
    });
    expect(points).toBe(10);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL with a TypeScript error — `timeRemainingMs: null` is not assignable to `number` in `ScoreGuessInput`/`calculateSpeedMultiplier`'s current signature.

- [ ] **Step 3: Update scoring implementation**

Edit `lib/game/scoring.ts`:

```typescript
import type { TileColor } from "./types";

export interface ScoreGuessInput {
  tiles: TileColor[];
  solved: boolean;
  timeRemainingMs: number | null;
  roundDurationMs: number;
}

const YELLOW_POINTS = 5;
const GREEN_POINTS = 10;
const SOLVE_BONUS = 50;
const MIN_MULTIPLIER = 1;
const MAX_MULTIPLIER = 2;

export function calculateSpeedMultiplier(
  timeRemainingMs: number | null,
  roundDurationMs: number
): number {
  if (timeRemainingMs === null) return MIN_MULTIPLIER;
  const raw = 1 + timeRemainingMs / roundDurationMs;
  return Math.min(Math.max(raw, MIN_MULTIPLIER), MAX_MULTIPLIER);
}

export function calculateGuessPoints(input: ScoreGuessInput): number {
  const { tiles, solved, timeRemainingMs, roundDurationMs } = input;
  const tilePoints = tiles.reduce((sum, tile) => {
    if (tile === "green") return sum + GREEN_POINTS;
    if (tile === "yellow") return sum + YELLOW_POINTS;
    return sum;
  }, 0);
  const bonus = solved ? SOLVE_BONUS : 0;
  const multiplier = calculateSpeedMultiplier(timeRemainingMs, roundDurationMs);
  return Math.round((tilePoints + bonus) * multiplier);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS — all scoring tests green (9 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/game/scoring.ts lib/game/scoring.test.ts
git commit -m "feat: flat scoring multiplier for infinite mode"
```

---

## Task 3: Round lifecycle — finalize straight to finished

**Files:**
- Modify: `lib/game/round-lifecycle.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `finalizeRoundIfNeeded(db, roomCode, roundNumber)` now sets room `status: "finished"` instead of `"round_end"`. `allPlayersDone` signature unchanged.

There's no dedicated unit test file for `round-lifecycle.ts` today (it's exercised indirectly through the API routes touched in Task 4-6); this task's correctness is verified by the manual end-to-end check in Task 8.

- [ ] **Step 1: Update `finalizeRoundIfNeeded`**

Edit `lib/game/round-lifecycle.ts:17-18`, changing the transaction body:

```typescript
export async function finalizeRoundIfNeeded(
  db: Firestore,
  roomCode: string,
  roundNumber: number
): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roundRef = roomRef.collection("rounds").doc(String(roundNumber));

  await db.runTransaction(async (tx) => {
    const roundSnap = await tx.get(roundRef);
    if (!roundSnap.exists) return;
    if (roundSnap.data()!.status === "ended") return;

    tx.update(roundRef, { status: "ended" });
    tx.update(roomRef, { status: "finished" });
  });
}
```

(Only the `tx.update(roomRef, ...)` line changes, from `"round_end"` to `"finished"`.)

- [ ] **Step 2: Commit**

```bash
git add lib/game/round-lifecycle.ts
git commit -m "feat: single round finalizes straight to finished status"
```

---

## Task 4: API routes — room creation, start, settings, guess, delete round/next

**Files:**
- Modify: `app/api/rooms/route.ts`
- Modify: `app/api/rooms/[code]/start/route.ts`
- Modify: `app/api/rooms/[code]/settings/route.ts`
- Modify: `app/api/rooms/[code]/guess/route.ts`
- Delete: `app/api/rooms/[code]/round/next/route.ts`

**Interfaces:**
- Consumes: `RoomDoc`/`RoundDoc` shapes from Task 1, `calculateGuessPoints` from Task 2, `finalizeRoundIfNeeded`/`allPlayersDone` from Task 3.
- Produces: room creation defaults to `mode: "timed"`; start route sets `roundEndsAt: null` when infinite; guess route passes `timeRemainingMs: null` in infinite mode and skips the expiry check.

- [ ] **Step 1: Update room creation defaults**

Edit `app/api/rooms/route.ts` — remove `DEFAULT_ROUND_COUNT`, add default mode, drop `roundCount`/`currentRound` from the room doc:

```typescript
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { createRoomSchema } from "@/lib/game/validation";
import { generateRoomCode } from "@/lib/game/room-code";

const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const DEFAULT_ROUND_DURATION_MS = 30000;
const MAX_CODE_ATTEMPTS = 10;

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { nickname } = parsed.data;
  const playerId = randomUUID();

  let code = "";
  let created = false;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    code = generateRoomCode();
    const roomRef = adminDb.collection("rooms").doc(code);
    const existing = await roomRef.get();
    if (existing.exists) continue;

    const now = Date.now();
    await roomRef.set({
      code,
      status: "lobby",
      hostPlayerId: playerId,
      mode: "timed",
      roundDurationMs: DEFAULT_ROUND_DURATION_MS,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
    });
    await roomRef.collection("players").doc(playerId).set({
      nickname,
      isHost: true,
      connected: true,
      totalScore: 0,
      joinedAt: now,
      lastGuessAt: null,
    });
    created = true;
    break;
  }

  if (!created) {
    return NextResponse.json(
      { error: "Could not allocate a room code, try again" },
      { status: 500 }
    );
  }

  return NextResponse.json({ code, playerId });
}
```

- [ ] **Step 2: Update the start route to branch on mode**

Edit `app/api/rooms/[code]/start/route.ts:39-48`, replacing the round-creation block:

```typescript
  const secretWord = pickSecretWord();
  const now = Date.now();

  await roomRef.collection("rounds").doc("1").set({
    roundNumber: 1,
    secretWord,
    startedAt: now,
    roundEndsAt: room.mode === "timed" ? now + room.roundDurationMs : null,
    status: "active",
    solvedBy: [],
  });

  await roomRef.update({ status: "in_round" });
```

(Drops `currentRound: 1` from the update since `RoomDoc` no longer has that field.)

- [ ] **Step 3: Delete the round/next route**

Run: `rm "app/api/rooms/[code]/round/next/route.ts"`

Also remove the now-empty `round/next` directory if it's left behind:

Run: `rmdir "app/api/rooms/[code]/round/next" 2>/dev/null || true`

- [ ] **Step 4: Update the settings route to persist mode**

Edit `app/api/rooms/[code]/settings/route.ts:33-36`:

```typescript
  await roomRef.update({
    mode: parsed.data.mode,
    ...(parsed.data.roundDurationMs !== undefined
      ? { roundDurationMs: parsed.data.roundDurationMs }
      : {}),
  });
```

- [ ] **Step 5: Update the guess route for infinite mode**

Edit `app/api/rooms/[code]/guess/route.ts`:

Replace line 50 (`const roundNumber = room.currentRound;`) with a fixed round number, since there's only ever one round:

```typescript
  const roundNumber = 1;
```

Replace the expiry check at lines 57-60:

```typescript
  const round = roundSnap.data() as RoundDoc;
  if (round.roundEndsAt !== null && now >= round.roundEndsAt) {
    await finalizeRoundIfNeeded(adminDb, roomCode, roundNumber);
    return NextResponse.json({ error: "Time is up" }, { status: 409 });
  }
```

Replace lines 78-84 (`timeRemainingMs` computation and `calculateGuessPoints` call):

```typescript
  const timeRemainingMs = round.roundEndsAt !== null ? Math.max(0, round.roundEndsAt - now) : null;
  const pointsEarned = calculateGuessPoints({
    tiles,
    solved,
    timeRemainingMs,
    roundDurationMs: room.roundDurationMs,
  });
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS — no test file directly covers these routes (no route-level tests exist in this project), but this confirms Tasks 1-3's unit tests still pass after the route changes that consume them.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. This is the main safety net for the route changes since there's no route-level test harness — it confirms every reference to the now-removed `roundCount`/`currentRound`/`roundNextSchema` has been updated.

- [ ] **Step 8: Commit**

```bash
git add app/api/rooms/route.ts "app/api/rooms/[code]/start/route.ts" "app/api/rooms/[code]/settings/route.ts" "app/api/rooms/[code]/guess/route.ts"
git rm "app/api/rooms/[code]/round/next/route.ts"
git commit -m "feat: single-round API routes with timed/infinite mode support"
```

---

## Task 5: API routes — round/check and reset

**Files:**
- Modify: `app/api/rooms/[code]/round/check/route.ts`
- Modify: `app/api/rooms/[code]/reset/route.ts`

**Interfaces:**
- Consumes: `RoomDoc`/`RoundDoc` from Task 1.
- Produces: `round/check` handles `roundEndsAt: null` (never expires) and uses a fixed round number `1`; `reset` no longer resets `currentRound`.

- [ ] **Step 1: Update round/check for the fixed round and nullable deadline**

Edit `app/api/rooms/[code]/round/check/route.ts:22,28`:

```typescript
  const roundRef = roomRef.collection("rounds").doc("1");
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists) {
    return NextResponse.json({ ok: true, finalized: false });
  }
  const round = roundSnap.data() as RoundDoc;
  if (round.roundEndsAt === null || Date.now() < round.roundEndsAt) {
    return NextResponse.json({ ok: true, finalized: false });
  }

  await finalizeRoundIfNeeded(adminDb, roomCode, 1);
  return NextResponse.json({ ok: true, finalized: true });
```

(This replaces the block that read `room.currentRound` — the full new function body for lines 6-34 becomes: keep lines 6-20 unchanged, replace lines 22-33 as above.)

- [ ] **Step 2: Update reset route to drop currentRound**

Edit `app/api/rooms/[code]/reset/route.ts:45`:

```typescript
  await roomRef.update({ status: "lobby" });
```

(Removes `currentRound: 0` since the field no longer exists on `RoomDoc`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/rooms/[code]/round/check/route.ts" "app/api/rooms/[code]/reset/route.ts"
git commit -m "feat: adapt round-check and reset routes to single-round model"
```

---

## Task 6: Client state machine — drop RoundEnd, wire mode through

**Files:**
- Modify: `app/room/[code]/page.tsx`
- Delete: `components/RoundEnd.tsx`
- Modify: `components/Timer.tsx`
- Modify: `components/RoundPlay.tsx`

**Interfaces:**
- Consumes: `RoomDoc`, `RoundDoc` from Task 1.
- Produces: room page renders `Lobby → RoundPlay → Podium` (no `round_end` branch); `Timer` accepts `roundEndsAt: number | null` and renders an infinite indicator when null; `Podium` gains a `secretWord` prop (wired in Task 7).

- [ ] **Step 1: Delete RoundEnd component**

Run: `rm components/RoundEnd.tsx`

- [ ] **Step 2: Update Timer for nullable deadline**

Edit `components/Timer.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  roundEndsAt: number | null;
  roundDurationMs: number;
  onExpire: () => void;
}

export function Timer({ roundEndsAt, roundDurationMs, onExpire }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    roundEndsAt === null ? 0 : Math.max(0, roundEndsAt - Date.now())
  );

  useEffect(() => {
    if (roundEndsAt === null) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, roundEndsAt - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [roundEndsAt, onExpire]);

  if (roundEndsAt === null) {
    return (
      <div className="w-full max-w-md border-4 border-black bg-[var(--accent-secondary)] px-3 py-2 text-center">
        <p className="font-[var(--font-display)] text-lg font-black uppercase tracking-widest">
          ∞ No Clock
        </p>
      </div>
    );
  }

  const seconds = Math.ceil(remainingMs / 1000);
  const percent = Math.min(100, Math.max(0, (remainingMs / roundDurationMs) * 100));

  return (
    <div className="w-full max-w-md border-4 border-black bg-white">
      <div className="h-4 w-full overflow-hidden border-b-4 border-black bg-white">
        <div
          className="h-full bg-[var(--accent-primary)] transition-[width] duration-200 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="py-1 text-center font-[var(--font-display)] text-lg font-black uppercase">
        {seconds}s
      </p>
    </div>
  );
}
```

(Visual classes here anticipate the design tokens defined in Task 9 — `--accent-primary`, `--accent-secondary`, `--font-display`. This task can land before Task 9; the CSS variables will simply be unstyled/inherit until Task 9 defines them, which is fine since Task 9 runs immediately after in this same plan.)

- [ ] **Step 3: Update RoundPlay for nullable duration**

Edit `components/RoundPlay.tsx:14` — change the prop type:

```typescript
interface RoundPlayProps {
  roomCode: string;
  myPlayerId: string;
  round: RoundDoc;
  roundDurationMs: number;
  myGuess: GuessDoc | null;
}
```

No change needed here — `roundDurationMs` stays a required `number` (it's still used for the speed-multiplier display math when in timed mode; `RoundDoc.roundEndsAt` is what becomes nullable, which is already handled by passing `round.roundEndsAt` straight through to `Timer`, unchanged at `RoundPlay.tsx:90`).

- [ ] **Step 4: Update the room page state machine**

Edit `app/room/[code]/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearPlayerId, savePlayerId, usePlayerId } from "@/lib/player-session";
import { useRoomStore } from "@/store/useRoomStore";
import { useRoomSubscription } from "@/hooks/useRoomSubscription";
import { useRoundSubscription } from "@/hooks/useRoundSubscription";
import { useMyGuessSubscription } from "@/hooks/useMyGuessSubscription";
import { useRoundGuesses } from "@/hooks/useRoundGuesses";
import { usePresenceSync } from "@/hooks/usePresenceSync";
import { usePresenceToasts } from "@/hooks/usePresenceToasts";
import { registerPresence } from "@/lib/firebase/presence";
import { Lobby } from "@/components/Lobby";
import { JoinInline } from "@/components/JoinInline";
import { RoundPlay } from "@/components/RoundPlay";
import { Podium } from "@/components/Podium";
import { ToastStack } from "@/components/Toast";

const ROUND_NUMBER = 1;

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = params.code.toUpperCase();

  const myPlayerId = usePlayerId(roomCode);

  useRoomSubscription(roomCode);
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);

  const round = useRoundSubscription(roomCode, ROUND_NUMBER);
  const myGuess = useMyGuessSubscription(roomCode, ROUND_NUMBER, myPlayerId ?? null);
  const guessesByPlayer = useRoundGuesses(
    roomCode,
    ROUND_NUMBER,
    room?.status === "finished"
  );

  usePresenceSync(roomCode, myPlayerId ?? null);

  useEffect(() => {
    if (!myPlayerId) return;
    return registerPresence(roomCode, myPlayerId);
  }, [roomCode, myPlayerId]);

  const toasts = usePresenceToasts(players);

  const [resetting, setResetting] = useState(false);

  function handleLeave() {
    clearPlayerId(roomCode);
    router.push("/");
  }

  async function handlePlayAgain() {
    if (!myPlayerId) return;
    setResetting(true);
    await fetch(`/api/rooms/${roomCode}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    setResetting(false);
  }

  if (myPlayerId === undefined || (myPlayerId && !room)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!myPlayerId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <JoinInline
          roomCode={roomCode}
          onJoined={(id) => savePlayerId(roomCode, id)}
        />
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-lg text-gray-600">Room not found. It may have expired.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6">
      <ToastStack toasts={toasts} />
      {room.status === "lobby" && (
        <Lobby
          room={room}
          players={players}
          myPlayerId={myPlayerId}
          roomCode={roomCode}
          onLeave={handleLeave}
        />
      )}
      {room.status === "in_round" && round && (
        <RoundPlay
          roomCode={roomCode}
          myPlayerId={myPlayerId}
          round={round}
          roundDurationMs={room.roundDurationMs}
          myGuess={myGuess}
        />
      )}
      {room.status === "finished" && round && (
        <Podium
          players={players}
          isHost={room.hostPlayerId === myPlayerId}
          onPlayAgain={handlePlayAgain}
          resetting={resetting}
          secretWord={round.secretWord}
          guessesByPlayer={guessesByPlayer}
        />
      )}
    </main>
  );
}
```

Note: `room.status === "round_end"` is now an intermediate state that's skipped in rendering — per Task 3, `finalizeRoundIfNeeded` now writes `"finished"` directly, so `"round_end"` is never actually set. The `RoomStatus` type still includes `"round_end"` for now since `finalizeRoundIfNeeded`'s round-level "already ended" guard checks `RoundDoc.status`, not `RoomDoc.status` — this is fine to leave as an unused union member; removing it is optional cleanup, not required by the spec.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Errors expected at this point — `usePresenceToasts`, `Toast`/`ToastStack`, and `Podium`'s new `secretWord`/`guessesByPlayer` props don't exist yet (built in Tasks 7-8). This step is a checkpoint to confirm the *only* errors are those missing pieces, not something else broken by this task's edits.

- [ ] **Step 6: Commit**

```bash
git add "app/room/[code]/page.tsx" components/Timer.tsx components/RoundPlay.tsx
git rm components/RoundEnd.tsx
git commit -m "feat: collapse room state machine to lobby -> round -> podium"
```

---

## Task 7: Podium absorbs the round-end reveal

**Files:**
- Modify: `components/Podium.tsx`

**Interfaces:**
- Consumes: `PlayerWithId` from `store/useRoomStore`, `GuessDoc` from `lib/game/types`.
- Produces: `Podium` now takes `secretWord: string` and `guessesByPlayer: Record<string, GuessDoc>` in addition to its existing props, and renders the secret word above the podium blocks.

- [ ] **Step 1: Update Podium to accept and render the secret word**

Edit `components/Podium.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc } from "@/lib/game/types";

interface PodiumProps {
  players: PlayerWithId[];
  isHost: boolean;
  onPlayAgain: () => void;
  resetting: boolean;
  secretWord: string;
  guessesByPlayer: Record<string, GuessDoc>;
}

const PLACE_COLORS: Record<number, string> = {
  1: "bg-yellow-400",
  2: "bg-gray-300",
  3: "bg-orange-300",
};
const PLACE_HEIGHTS: Record<number, string> = {
  1: "h-32",
  2: "h-24",
  3: "h-16",
};

export function Podium({
  players,
  isHost,
  onPlayAgain,
  resetting,
  secretWord,
  guessesByPlayer,
}: PodiumProps) {
  const ranked = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const [first, second, third] = ranked;

  const firstPlaceId = first?.id;
  useEffect(() => {
    if (!firstPlaceId) return;
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
  }, [firstPlaceId]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-gray-500">The word was</p>
        <p className="text-3xl font-bold uppercase tracking-widest">{secretWord}</p>
      </div>
      <h2 className="text-2xl font-bold">Final Results</h2>
      <div className="flex w-full items-end justify-center gap-3">
        {second && <PodiumSpot player={second} place={2} />}
        {first && <PodiumSpot player={first} place={1} />}
        {third && <PodiumSpot player={third} place={3} />}
      </div>
      <ul className="w-full">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between border-b border-gray-100 py-1 text-sm">
            <span>
              {i + 1}. {p.nickname}
              {guessesByPlayer[p.id]?.solved && (
                <span className="ml-2 text-xs text-green-600">solved</span>
              )}
            </span>
            <span className="font-semibold">{p.totalScore}</span>
          </li>
        ))}
      </ul>
      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={resetting}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {resetting ? "Resetting..." : "Play Again"}
        </button>
      )}
    </div>
  );
}

function PodiumSpot({ player, place }: { player: PlayerWithId; place: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm font-semibold">{player.nickname}</span>
      <div
        className={`flex w-20 items-start justify-center rounded-t pt-2 text-xl font-bold ${PLACE_HEIGHTS[place]} ${PLACE_COLORS[place]}`}
      >
        {place}
      </div>
    </div>
  );
}
```

(This step keeps the existing plain Tailwind classes — the brutalist restyle of this same file happens in Task 10. Splitting data-shape changes from visual changes keeps each commit reviewable independently.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `Podium`-related errors from Task 6 are now resolved. Remaining errors (if any) should only be about `usePresenceToasts`/`Toast` from Task 8.

- [ ] **Step 3: Commit**

```bash
git add components/Podium.tsx
git commit -m "feat: fold secret-word reveal into Podium screen"
```

---

## Task 8: Disconnect/reconnect toasts

**Files:**
- Create: `hooks/usePresenceToasts.ts`
- Create: `components/Toast.tsx`

**Interfaces:**
- Consumes: `PlayerWithId[]` from `store/useRoomStore`.
- Produces: `usePresenceToasts(players: PlayerWithId[]): ToastMessage[]` where `ToastMessage = { id: string; text: string; kind: "left" | "rejoined" }`. `ToastStack({ toasts }: { toasts: ToastMessage[] })` renders them, auto-dismissing after 4s.

- [ ] **Step 1: Create the toast hook**

Write `hooks/usePresenceToasts.ts`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";

export interface ToastMessage {
  id: string;
  text: string;
  kind: "left" | "rejoined";
}

const TOAST_LIFETIME_MS = 4000;

export function usePresenceToasts(players: PlayerWithId[]): ToastMessage[] {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const previousConnected = useRef<Map<string, boolean> | null>(null);

  useEffect(() => {
    const current = new Map(players.map((p) => [p.id, p.connected]));

    if (previousConnected.current === null) {
      previousConnected.current = current;
      return;
    }

    const prev = previousConnected.current;
    const newToasts: ToastMessage[] = [];

    for (const player of players) {
      const wasConnected = prev.get(player.id);
      if (wasConnected === undefined) continue;
      if (wasConnected && !player.connected) {
        newToasts.push({
          id: `${player.id}-left-${Date.now()}`,
          text: `${player.nickname} left the room`,
          kind: "left",
        });
      } else if (!wasConnected && player.connected) {
        newToasts.push({
          id: `${player.id}-rejoined-${Date.now()}`,
          text: `${player.nickname} reconnected`,
          kind: "rejoined",
        });
      }
    }

    previousConnected.current = current;

    if (newToasts.length > 0) {
      setToasts((existing) => [...existing, ...newToasts]);
      for (const toast of newToasts) {
        setTimeout(() => {
          setToasts((existing) => existing.filter((t) => t.id !== toast.id));
        }, TOAST_LIFETIME_MS);
      }
    }
  }, [players]);

  return toasts;
}
```

- [ ] **Step 2: Create the toast UI component**

Write `components/Toast.tsx`:

```typescript
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ToastMessage } from "@/hooks/usePresenceToasts";

interface ToastStackProps {
  toasts: ToastMessage[];
}

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-wide shadow-[4px_4px_0_#000] ${
              toast.kind === "left" ? "bg-[var(--accent-primary)] text-white" : "bg-[var(--accent-secondary)] text-black"
            }`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors — all imports introduced across Tasks 6-8 (`usePresenceToasts`, `ToastStack`, `Podium`'s new props) now resolve.

- [ ] **Step 4: Commit**

```bash
git add hooks/usePresenceToasts.ts components/Toast.tsx
git commit -m "feat: add disconnect/reconnect toast notifications"
```

---

## Task 9: Design tokens — Concrete & Rust theme + Condensed Impact font

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--surface`, `--ink`, `--accent-primary`, `--accent-secondary`, `--tile-correct`, `--font-display` available globally via Tailwind's `@theme inline`, plus a `--shadow-brutal` box-shadow value. `next/font/google`'s `Anton` loaded as the display font.

- [ ] **Step 1: Add Anton font loading in the root layout**

Edit `app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wordle Arena",
  description: "Fast-paced multiplayer Wordle showdown",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace the token set in globals.css**

Edit `app/globals.css`:

```css
@import "tailwindcss";

:root {
  --surface: #f2f0e9;
  --ink: #000000;
  --accent-primary: #ff4b1f;
  --accent-secondary: #ffc53d;
  --tile-correct: #6b8e23;
  --tile-present: #ffc53d;
  --tile-absent: #6b6b6b;
  --shadow-brutal: 4px 4px 0 #000000;
  --shadow-brutal-accent: 4px 4px 0 #ff4b1f;
}

@theme inline {
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-accent-primary: var(--accent-primary);
  --color-accent-secondary: var(--accent-secondary);
  --color-tile-correct: var(--tile-correct);
  --color-tile-present: var(--tile-present);
  --color-tile-absent: var(--tile-absent);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-display);
}

body {
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

(Drops the `prefers-color-scheme: dark` override — the brutalist palette is a single deliberate light theme, not a light/dark pair; the spec doesn't call for dark mode.)

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `http://localhost:3000`. Expected: page background is now off-white (`#F2F0E9`) instead of pure white, body text renders in the Geist sans stack (unchanged), no console errors about the `Anton` font failing to load.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add Concrete & Rust design tokens and Condensed Impact display font"
```

---

## Task 10: Restyle — home, join, lobby

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/JoinInline.tsx`
- Modify: `components/Lobby.tsx`

**Interfaces:**
- Consumes: design tokens from Task 9 (`--accent-primary`, `--accent-secondary`, `--font-display`, `--shadow-brutal`), `mode`/`GameMode` from `lib/game/types` (Task 1).
- Produces: `Lobby` gains the mode toggle UI, replacing the round-count input with a Timed/Infinite switch that shows/hides the duration input.

- [ ] **Step 1: Restyle the home page**

Edit `app/page.tsx`:

```typescript
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePlayerId } from "@/lib/player-session";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      savePlayerId(data.code, data.playerId);
      router.push(`/room/${data.code}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface p-6">
      <h1 className="font-[var(--font-display)] text-6xl uppercase tracking-tight text-ink">
        Wordle<br className="sm:hidden" /> Arena
      </h1>
      <form
        onSubmit={handleCreateRoom}
        className="flex w-full max-w-sm flex-col gap-4 border-4 border-black bg-white p-5 shadow-[var(--shadow-brutal)]"
      >
        <input
          className="border-4 border-black px-3 py-2 font-bold placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-secondary"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="border-4 border-black bg-accent-primary px-4 py-3 font-[var(--font-display)] uppercase tracking-wide text-white shadow-[var(--shadow-brutal)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
        <a
          href="/join"
          className="text-center text-sm font-bold uppercase underline decoration-2 underline-offset-4"
        >
          Have a room code? Join instead
        </a>
        {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Restyle JoinInline**

Edit `components/JoinInline.tsx`:

```typescript
"use client";

import { useState, type FormEvent } from "react";

interface JoinInlineProps {
  roomCode: string;
  onJoined: (playerId: string) => void;
}

export function JoinInline({ roomCode, onJoined }: JoinInlineProps) {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join room");
        return;
      }
      onJoined(data.playerId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleJoin}
      className="flex w-full max-w-sm flex-col gap-4 border-4 border-black bg-white p-5 shadow-[var(--shadow-brutal)]"
    >
      <p className="text-center font-[var(--font-display)] text-2xl uppercase tracking-wide">
        Join room {roomCode}
      </p>
      <input
        className="border-4 border-black px-3 py-2 font-bold placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-secondary"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="border-4 border-black bg-accent-primary px-4 py-3 font-[var(--font-display)] uppercase tracking-wide text-white shadow-[var(--shadow-brutal)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Room"}
      </button>
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Restyle Lobby and add the mode toggle**

Edit `components/Lobby.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GameMode, RoomDoc } from "@/lib/game/types";

interface LobbyProps {
  room: RoomDoc;
  players: PlayerWithId[];
  myPlayerId: string;
  roomCode: string;
  onLeave: () => void;
}

export function Lobby({ room, players, myPlayerId, roomCode, onLeave }: LobbyProps) {
  const isHost = room.hostPlayerId === myPlayerId;
  const [mode, setMode] = useState<GameMode>(room.mode);
  const [roundDurationSec, setRoundDurationSec] = useState(room.roundDurationMs / 1000);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leaveRoom() {
    setLeaving(true);
    await fetch(`/api/rooms/${roomCode}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    onLeave();
  }

  async function saveSettings(nextMode: GameMode, nextDurationSec: number) {
    await fetch(`/api/rooms/${roomCode}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        mode: nextMode,
        ...(nextMode === "timed" ? { roundDurationMs: nextDurationSec * 1000 } : {}),
      }),
    });
  }

  function selectMode(nextMode: GameMode) {
    setMode(nextMode);
    saveSettings(nextMode, roundDurationSec);
  }

  async function startGame() {
    setError(null);
    setStarting(true);
    const res = await fetch(`/api/rooms/${roomCode}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    setStarting(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="border-4 border-black bg-white p-4 text-center shadow-[var(--shadow-brutal)]">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Room code</p>
        <p className="font-[var(--font-display)] text-4xl uppercase tracking-widest">{roomCode}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between border-4 border-black bg-white px-3 py-2 font-bold"
          >
            <span>{p.nickname}</span>
            {p.isHost && (
              <span className="border-2 border-black bg-accent-secondary px-2 py-0.5 text-xs font-black uppercase">
                Host
              </span>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="flex flex-col gap-4 border-4 border-black bg-white p-4 shadow-[var(--shadow-brutal)]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selectMode("timed")}
              className={`flex-1 border-4 border-black py-2 font-[var(--font-display)] uppercase tracking-wide ${
                mode === "timed" ? "bg-accent-primary text-white" : "bg-white"
              }`}
            >
              Timed
            </button>
            <button
              type="button"
              onClick={() => selectMode("infinite")}
              className={`flex-1 border-4 border-black py-2 font-[var(--font-display)] uppercase tracking-wide ${
                mode === "infinite" ? "bg-accent-primary text-white" : "bg-white"
              }`}
            >
              Infinite
            </button>
          </div>
          {mode === "timed" && (
            <label className="flex items-center justify-between text-sm font-bold uppercase">
              Round duration (sec)
              <input
                type="number"
                min={10}
                max={120}
                value={roundDurationSec}
                onChange={(e) => setRoundDurationSec(Number(e.target.value))}
                onBlur={() => saveSettings(mode, roundDurationSec)}
                className="w-20 border-4 border-black px-2 py-1 text-center"
              />
            </label>
          )}
          <button
            onClick={startGame}
            disabled={players.length < 2 || starting}
            className="border-4 border-black bg-accent-primary px-4 py-3 font-[var(--font-display)] uppercase tracking-wide text-white shadow-[var(--shadow-brutal)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
          >
            {players.length < 2 ? "Need 2+ players" : starting ? "Starting..." : "Start Game"}
          </button>
        </div>
      )}
      <button
        onClick={leaveRoom}
        disabled={leaving}
        className="text-sm font-bold uppercase underline decoration-2 underline-offset-4 disabled:opacity-50"
      >
        {leaving ? "Leaving..." : "Leave Room"}
      </button>
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Create a room, confirm: home page shows the brutalist card with offset shadow; in the lobby, toggling Timed/Infinite shows/hides the duration field and persists via the settings PATCH (check Network tab); starting with 1 player is blocked as before.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/JoinInline.tsx components/Lobby.tsx
git commit -m "feat: restyle home/join/lobby screens, add mode toggle UI"
```

---

## Task 11: Restyle — gameplay screens (board, keyboard, timer already done)

**Files:**
- Modify: `components/GameBoard.tsx`
- Modify: `components/Keyboard.tsx`
- Modify: `components/RoundPlay.tsx`

**Interfaces:**
- Consumes: design tokens from Task 9.
- Produces: no interface changes — purely visual.

- [ ] **Step 1: Restyle GameBoard tile colors**

Edit `components/GameBoard.tsx:13-17`, replacing `TILE_COLORS`:

```typescript
const TILE_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct border-black text-white",
  yellow: "bg-tile-present border-black text-black",
  gray: "bg-tile-absent border-black text-white",
};
```

Edit the tile rendering at `components/GameBoard.tsx:50` (submitted tile) — change `rounded border-2` to `border-4` (no rounding, thicker border) and add a hard shadow:

```typescript
                  className={`flex h-12 w-12 items-center justify-center border-4 text-2xl font-black shadow-[3px_3px_0_#000] sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
```

Edit the current-row tile at line 61:

```typescript
                  className="flex h-12 w-12 items-center justify-center border-4 border-black text-2xl font-black sm:h-14 sm:w-14"
```

Edit the empty tile at line 70:

```typescript
                className="flex h-12 w-12 items-center justify-center border-4 border-gray-300 sm:h-14 sm:w-14"
```

- [ ] **Step 2: Restyle Keyboard**

Edit `components/Keyboard.tsx:29-33`, replacing `KEY_COLORS`:

```typescript
const KEY_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct text-white",
  yellow: "bg-tile-present text-black",
  gray: "bg-tile-absent text-white",
};
```

Edit the ENTER button at line 43-49:

```typescript
            <button
              disabled={disabled}
              onClick={() => onKeyPress("ENTER")}
              className="border-4 border-black bg-white px-3 py-3 text-xs font-black uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
            >
              Enter
            </button>
```

Edit the letter key button at lines 51-62:

```typescript
          {row.split("").map((letter) => (
            <button
              key={letter}
              disabled={disabled}
              onClick={() => onKeyPress(letter)}
              className={`border-4 border-black px-2.5 py-3 text-sm font-black shadow-[2px_2px_0_#000] disabled:opacity-50 ${
                keyStates[letter] ? KEY_COLORS[keyStates[letter]] : "bg-white"
              }`}
            >
              {letter}
            </button>
          ))}
```

Edit the Del/Backspace button at lines 64-70:

```typescript
            <button
              disabled={disabled}
              onClick={() => onKeyPress("BACKSPACE")}
              className="border-4 border-black bg-white px-3 py-3 text-xs font-black uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
            >
              Del
            </button>
```

- [ ] **Step 3: Restyle status messages in RoundPlay**

Edit `components/RoundPlay.tsx:100-106`:

```typescript
      {solved && (
        <p className="border-4 border-black bg-tile-correct px-4 py-2 font-[var(--font-display)] uppercase text-white shadow-[var(--shadow-brutal)]">
          You solved it! Waiting for others...
        </p>
      )}
      {outOfAttempts && !solved && (
        <p className="border-4 border-black bg-white px-4 py-2 font-[var(--font-display)] uppercase shadow-[var(--shadow-brutal)]">
          Out of guesses. Waiting for others...
        </p>
      )}
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, join a room with 2 players (two browser tabs), start a game, submit guesses in both tabs. Confirm: tiles show thick borders + hard shadows in the new palette (olive green / mustard / dark gray), keyboard keys match, flip animation still works, timer still counts down in timed mode.

- [ ] **Step 6: Commit**

```bash
git add components/GameBoard.tsx components/Keyboard.tsx components/RoundPlay.tsx
git commit -m "feat: restyle gameplay board, keyboard, and status messages"
```

---

## Task 12: Restyle — leaderboard and podium

**Files:**
- Modify: `components/Leaderboard.tsx`
- Modify: `components/Podium.tsx`

**Interfaces:**
- Consumes: design tokens from Task 9.
- Produces: no interface changes — purely visual.

- [ ] **Step 1: Restyle Leaderboard**

Edit `components/Leaderboard.tsx:22-33`:

```typescript
          <motion.li
            key={player.id}
            layout
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-center justify-between border-4 border-black bg-white px-3 py-2 font-bold shadow-[3px_3px_0_#000]"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm text-gray-500">#{index + 1}</span>
              {player.nickname}
            </span>
            <span className="flex items-center gap-2">
              {pointsThisRound?.[player.id] != null && (
                <span className="text-xs font-black text-tile-correct">+{pointsThisRound[player.id]}</span>
              )}
              <span className="font-[var(--font-display)] text-lg">{player.totalScore}</span>
            </span>
          </motion.li>
```

- [ ] **Step 2: Restyle Podium**

Edit `components/Podium.tsx`, replacing the color/height maps and JSX:

```typescript
const PLACE_COLORS: Record<number, string> = {
  1: "bg-accent-secondary",
  2: "bg-gray-300",
  3: "bg-accent-primary",
};
const PLACE_HEIGHTS: Record<number, string> = {
  1: "h-32",
  2: "h-24",
  3: "h-16",
};
```

Replace the return JSX:

```typescript
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="border-4 border-black bg-white p-4 text-center shadow-[var(--shadow-brutal)]">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">The word was</p>
        <p className="font-[var(--font-display)] text-4xl uppercase tracking-widest">{secretWord}</p>
      </div>
      <h2 className="font-[var(--font-display)] text-3xl uppercase">Final Results</h2>
      <div className="flex w-full items-end justify-center gap-3">
        {second && <PodiumSpot player={second} place={2} />}
        {first && <PodiumSpot player={first} place={1} />}
        {third && <PodiumSpot player={third} place={3} />}
      </div>
      <ul className="w-full">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className="flex justify-between border-b-2 border-black py-2 text-sm font-bold"
          >
            <span>
              {i + 1}. {p.nickname}
              {guessesByPlayer[p.id]?.solved && (
                <span className="ml-2 text-xs uppercase text-tile-correct">solved</span>
              )}
            </span>
            <span className="font-[var(--font-display)] text-lg">{p.totalScore}</span>
          </li>
        ))}
      </ul>
      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={resetting}
          className="border-4 border-black bg-accent-primary px-4 py-3 font-[var(--font-display)] uppercase tracking-wide text-white shadow-[var(--shadow-brutal)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
        >
          {resetting ? "Resetting..." : "Play Again"}
        </button>
      )}
    </div>
  );
}

function PodiumSpot({ player, place }: { player: PlayerWithId; place: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm font-bold">{player.nickname}</span>
      <div
        className={`flex w-20 items-start justify-center border-4 border-black pt-2 font-[var(--font-display)] text-2xl shadow-[3px_3px_0_#000] ${PLACE_HEIGHTS[place]} ${PLACE_COLORS[place]}`}
      >
        {place}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, play a full game to completion with 2 players. Confirm: podium shows secret word, ranked list, confetti fires, "Play Again" resets back to lobby with mode/duration settings intact.

- [ ] **Step 5: Commit**

```bash
git add components/Leaderboard.tsx components/Podium.tsx
git commit -m "feat: restyle leaderboard and podium screens"
```

---

## Task 13: Full end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm run test`
Expected: PASS — all files in `lib/game/*.test.ts` green.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds with no errors (this also catches unused-import/type errors that `tsc --noEmit` with certain configs might miss, and confirms `next/font` Anton loading works in a production build).

- [ ] **Step 4: Manual end-to-end pass — timed mode**

Run: `npm run dev`. Open two browser tabs/windows.
1. Tab A: create room, nickname "Host". Confirm home page and lobby show the Concrete & Rust styling.
2. Tab B: join with the room code, nickname "Guest".
3. In Tab A (host), confirm Timed mode is selected by default, set duration to 15s, start the game.
4. Both tabs: submit guesses. Confirm timer counts down, tiles flip with correct colors, keyboard updates.
5. Let the timer expire (or have both players finish). Confirm the game goes straight to the Podium screen (no intermediate round-end screen), secret word is revealed, scores and confetti show.
6. Tab A: click "Play Again". Confirm both tabs return to the lobby with `mode`/`roundDurationMs` still set from before.

- [ ] **Step 5: Manual end-to-end pass — infinite mode**

1. In the lobby, host switches to Infinite mode. Confirm the duration input disappears.
2. Start the game. Confirm `RoundPlay` shows the "∞ No Clock" indicator instead of a countdown bar.
3. Have one player solve the word and the other exhaust all 6 attempts (or also solve). Confirm the round ends automatically (via `allPlayersDone`) once both are done, landing on the Podium.
4. Confirm scores in infinite mode reflect flat scoring (tile points + 50 solve bonus, no speed multiplier) — cross-check the displayed score against the tile colors banked per guess.

- [ ] **Step 6: Manual verification — disconnect toast**

1. With both tabs in the lobby or an active round, close Tab B (or navigate it away) to simulate a disconnect.
2. In Tab A, confirm a toast appears within a few seconds reading "Guest left the room", styled with the border/shadow toast treatment, and auto-dismisses after ~4s.
3. Reopen Tab B and rejoin/reload. Confirm Tab A shows a "Guest reconnected" toast.

- [ ] **Step 7: Report results**

If all steps pass, the feature is complete. If any manual step fails, note which step and return to the relevant task above to fix before considering the plan done.

---
