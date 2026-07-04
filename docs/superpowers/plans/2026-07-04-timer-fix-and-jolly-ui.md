# Timer Fix + Jolly Light-Mode UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the timed-mode round duration bug (always ending at 30s regardless of host setting) and give the app a jolly, animated, light-mode-only neo-brutalist redesign using framer-motion and canvas-confetti (both already installed).

**Architecture:** Part 1 fixes the settings race by having `POST /start` accept and atomically persist `mode`/`roundDurationMs` instead of trusting a separately-persisted value, and switches the lobby duration control to minutes. Part 2 adds a reusable `BackgroundFX` decorative layer (framer-motion-driven floating emoji, no image assets) mounted at different intensities per screen, plus juiced-up micro-interactions on existing components (tiles, keyboard, buttons, toasts, podium).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Zod, Firebase Admin/Firestore, framer-motion, canvas-confetti, Tailwind CSS 4, Vitest.

## Global Constraints

- Light mode only — no dark mode work.
- No new npm dependencies — use only `framer-motion` and `canvas-confetti` (already in package.json).
- Keep the existing neo-brutalist palette from `app/globals.css` (cream surface, red/yellow/teal/pink/blue accents, thick black borders `border-4`, hard offset shadows `--shadow-brutal` / `--shadow-brutal-lg`) — amplify, don't replace.
- Minutes range for timed mode: 0.5–10 minutes (30,000–600,000 ms).
- Decorative animation layers must be `pointer-events-none` so they never block input.
- This codebase uses Next.js 16 — check `node_modules/next/dist/docs/` before using any App Router API you're unsure about (per `AGENTS.md`).
- Read from AGENTS.md: this Next.js version may differ from training data — route handler signatures (`context: { params: Promise<{ code: string }> }`) already reflect this; follow the existing pattern in files you edit, don't "fix" it to match older Next.js conventions.

---

### Task 1: Fix validation schemas for the timer race + minutes range

**Files:**
- Modify: `lib/game/validation.ts`
- Test: `lib/game/validation.test.ts`

**Interfaces:**
- Produces: `startRoomSchema` now shaped as `{ playerId: string, mode: "timed" | "infinite", roundDurationMs?: number }` with the same "required when timed" refinement `roomSettingsSchema` already uses. `roomSettingsSchema.roundDurationMs` bounds change to `min(30000).max(600000)`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/game/validation.test.ts` (append new `describe` blocks, keep existing ones untouched except where bounds changed):

```typescript
describe("roomSettingsSchema (minutes range)", () => {
  it("accepts a duration at the new 30s floor", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 30000 })
        .success
    ).toBe(true);
  });

  it("accepts a duration at the new 10min ceiling", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 600000 })
        .success
    ).toBe(true);
  });

  it("rejects a duration below 30s", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 10000 })
        .success
    ).toBe(false);
  });

  it("rejects a duration above 10min", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 700000 })
        .success
    ).toBe(false);
  });
});

describe("startRoomSchema", () => {
  it("accepts timed mode with a duration in bounds", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 90000 })
        .success
    ).toBe(true);
  });

  it("accepts infinite mode without a duration", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "infinite" }).success
    ).toBe(true);
  });

  it("rejects timed mode with no duration at all", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "timed" }).success
    ).toBe(false);
  });

  it("rejects timed mode with a duration out of bounds", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 5000 })
        .success
    ).toBe(false);
  });

  it("rejects a request missing playerId", () => {
    expect(startRoomSchema.safeParse({ mode: "infinite" }).success).toBe(false);
  });
});
```

Also update the existing `roomSettingsSchema` test `"rejects timed mode with a duration below 10s"` — change its name and value since the floor moved to 30s:

```typescript
  it("rejects timed mode with a duration below 30s", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 5000 })
        .success
    ).toBe(false);
  });
```

Update the import line at the top of the file to include `startRoomSchema`:

```typescript
import { createRoomSchema, guessSchema, roomSettingsSchema, startRoomSchema } from "./validation";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/game/validation.test.ts`
Expected: FAIL — `startRoomSchema` import works (it already exists) but has no `mode`/`roundDurationMs` fields yet, so the new `startRoomSchema` tests fail; the new/renamed `roomSettingsSchema` bound tests fail because bounds are still 10000/120000.

- [ ] **Step 3: Update validation.ts**

In `lib/game/validation.ts`, change the `roomSettingsSchema` bounds and rewrite `startRoomSchema`:

```typescript
export const roomSettingsSchema = z
  .object({
    playerId: z.string().min(1),
    mode: z.enum(["timed", "infinite"]),
    roundDurationMs: z.number().int().min(30000).max(600000).optional(),
  })
  .refine((data) => data.mode !== "timed" || data.roundDurationMs !== undefined, {
    message: "roundDurationMs is required for timed mode",
    path: ["roundDurationMs"],
  });

export const startRoomSchema = z
  .object({
    playerId: z.string().min(1),
    mode: z.enum(["timed", "infinite"]),
    roundDurationMs: z.number().int().min(30000).max(600000).optional(),
  })
  .refine((data) => data.mode !== "timed" || data.roundDurationMs !== undefined, {
    message: "roundDurationMs is required for timed mode",
    path: ["roundDurationMs"],
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/game/validation.test.ts`
Expected: PASS (all tests, including untouched `createRoomSchema`/`guessSchema` blocks)

- [ ] **Step 5: Commit**

```bash
git add lib/game/validation.ts lib/game/validation.test.ts
git commit -m "fix: widen round duration bounds to 30s-10min and add mode/duration to startRoomSchema"
```

---

### Task 2: Persist mode/duration atomically in the start route

**Files:**
- Modify: `app/api/rooms/[code]/start/route.ts`

**Interfaces:**
- Consumes: `startRoomSchema` from Task 1 (`{ playerId, mode, roundDurationMs? }`).
- Produces: `POST /api/rooms/[code]/start` now updates the room doc's `mode`/`roundDurationMs` fields (when provided) in the same call that creates round 1 and flips status to `in_round` — no dependency on a prior `PATCH /settings` call.

- [ ] **Step 1: Update start/route.ts**

Read current content first (already read above). Replace the full file:

```typescript
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { startRoomSchema } from "@/lib/game/validation";
import { pickSecretWord } from "@/lib/game/word-select";
import type { RoomDoc } from "@/lib/game/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const body = await request.json();
  const parsed = startRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const roomRef = adminDb.collection("rooms").doc(code.toUpperCase());
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomSnap.data() as RoomDoc;
  if (room.hostPlayerId !== parsed.data.playerId) {
    return NextResponse.json({ error: "Only the host can start the game" }, { status: 403 });
  }
  if (room.status !== "lobby") {
    return NextResponse.json({ error: "Game already started" }, { status: 409 });
  }

  const playersSnap = await roomRef.collection("players").get();
  if (playersSnap.size < 2) {
    return NextResponse.json({ error: "Need at least 2 players to start" }, { status: 409 });
  }

  const mode = parsed.data.mode;
  const roundDurationMs = mode === "timed" ? parsed.data.roundDurationMs! : room.roundDurationMs;

  const secretWord = pickSecretWord();
  const now = Date.now();

  await roomRef.collection("rounds").doc("1").set({
    roundNumber: 1,
    secretWord,
    startedAt: now,
    roundEndsAt: mode === "timed" ? now + roundDurationMs : null,
    status: "active",
    solvedBy: [],
  });

  await roomRef.update({ status: "in_round", mode, roundDurationMs });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Manual verification (no existing route test harness)**

This route has no unit test file today (it talks to Firestore via `adminDb`) and the codebase's existing pattern is manual/integration verification for routes. Confirm with a type check instead:

Run: `npx tsc --noEmit`
Expected: no new type errors introduced by this file.

- [ ] **Step 3: Commit**

```bash
git add "app/api/rooms/[code]/start/route.ts"
git commit -m "fix: persist mode and round duration atomically when starting a round"
```

---

### Task 3: Minutes-based duration input in Lobby, sent directly with Start

**Files:**
- Modify: `components/Lobby.tsx`

**Interfaces:**
- Consumes: `startRoomSchema`-shaped body now expected by `POST /api/rooms/[code]/start` (Task 2): `{ playerId, mode, roundDurationMs? }`.
- Produces: no new exports; internal behavior change only.

- [ ] **Step 1: Update Lobby.tsx state and handlers**

Replace lines 17–63 of `components/Lobby.tsx` (component body up through `startGame`) with:

```typescript
export function Lobby({ room, players, myPlayerId, roomCode, onLeave }: LobbyProps) {
  const isHost = room.hostPlayerId === myPlayerId;
  const [mode, setMode] = useState<GameMode>(room.mode);
  const [roundDurationMin, setRoundDurationMin] = useState(room.roundDurationMs / 60000);
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

  async function saveSettings(nextMode: GameMode, nextDurationMin: number) {
    await fetch(`/api/rooms/${roomCode}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        mode: nextMode,
        ...(nextMode === "timed" ? { roundDurationMs: Math.round(nextDurationMin * 60000) } : {}),
      }),
    });
  }

  function selectMode(nextMode: GameMode) {
    setMode(nextMode);
    saveSettings(nextMode, roundDurationMin);
  }

  async function startGame() {
    setError(null);
    setStarting(true);
    const res = await fetch(`/api/rooms/${roomCode}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        mode,
        ...(mode === "timed" ? { roundDurationMs: Math.round(roundDurationMin * 60000) } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    setStarting(false);
  }
```

- [ ] **Step 2: Update the duration input JSX**

Replace the duration `<label>` block (currently lines 111–124) with a minutes input:

```typescript
          {mode === "timed" && (
            <label className="flex items-center justify-between text-sm font-bold uppercase">
              Round duration (min)
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={roundDurationMin}
                onChange={(e) => setRoundDurationMin(Number(e.target.value))}
                onBlur={() => saveSettings(mode, roundDurationMin)}
                className="w-20 border-4 border-black px-2 py-1 text-center"
              />
            </label>
          )}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no type errors (component still exports the same `LobbyProps` interface, only internal state/JSX changed).

- [ ] **Step 4: Commit**

```bash
git add components/Lobby.tsx
git commit -m "feat: switch lobby duration control to minutes and send mode/duration directly on start"
```

---

### Task 4: `BackgroundFX` decorative animation layer

**Files:**
- Create: `components/BackgroundFX.tsx`

**Interfaces:**
- Produces: `BackgroundFX({ intensity }: { intensity: "calm" | "energetic" | "max" })` — a `pointer-events-none` fixed full-viewport layer of floating emoji, exported as a named export for use in Lobby/RoundPlay/Podium screens (wired up in Tasks 5–7).

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

type Intensity = "calm" | "energetic" | "max";

const EMOJI = ["🎉", "⭐", "✨", "🔤", "💥", "🟩", "🟨", "🎈"];

const INTENSITY_CONFIG: Record<
  Intensity,
  { count: number; minDuration: number; maxDuration: number; minScale: number; maxScale: number }
> = {
  calm: { count: 10, minDuration: 10, maxDuration: 16, minScale: 0.7, maxScale: 1.1 },
  energetic: { count: 16, minDuration: 6, maxDuration: 10, minScale: 0.8, maxScale: 1.3 },
  max: { count: 24, minDuration: 3, maxDuration: 6, minScale: 0.9, maxScale: 1.6 },
};

interface FloatingItem {
  id: number;
  emoji: string;
  left: number;
  top: number;
  duration: number;
  delay: number;
  scale: number;
  rotate: number;
}

function generateItems(intensity: Intensity): FloatingItem[] {
  const config = INTENSITY_CONFIG[intensity];
  return Array.from({ length: config.count }, (_, i) => ({
    id: i,
    emoji: EMOJI[i % EMOJI.length],
    left: Math.random() * 100,
    top: Math.random() * 100,
    duration: config.minDuration + Math.random() * (config.maxDuration - config.minDuration),
    delay: Math.random() * 4,
    scale: config.minScale + Math.random() * (config.maxScale - config.minScale),
    rotate: Math.random() > 0.5 ? 1 : -1,
  }));
}

export function BackgroundFX({ intensity }: { intensity: Intensity }) {
  const items = useMemo(() => generateItems(intensity), [intensity]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {items.map((item) => (
        <motion.span
          key={item.id}
          className="absolute select-none text-3xl opacity-40"
          style={{ left: `${item.left}%`, top: `${item.top}%`, scale: item.scale }}
          animate={{
            y: [0, -24, 0, 24, 0],
            rotate: [0, 15 * item.rotate, 0, -15 * item.rotate, 0],
          }}
          transition={{
            duration: item.duration,
            delay: item.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {item.emoji}
        </motion.span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/BackgroundFX.tsx
git commit -m "feat: add BackgroundFX floating decorative animation layer"
```

---

### Task 5: Wire BackgroundFX + sticker-card feel into Lobby

**Files:**
- Modify: `components/Lobby.tsx`

**Interfaces:**
- Consumes: `BackgroundFX` from Task 4 (`intensity="calm"`).

- [ ] **Step 1: Import BackgroundFX and motion**

At the top of `components/Lobby.tsx`, update imports:

```typescript
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GameMode, RoomDoc } from "@/lib/game/types";
import { BackgroundFX } from "./BackgroundFX";
```

- [ ] **Step 2: Wrap the returned JSX root**

Change the outer return wrapper (the `<div className="flex w-full max-w-md flex-col gap-4">`) to include `BackgroundFX` as a sibling and make the content relatively positioned above it:

```typescript
  return (
    <>
      <BackgroundFX intensity="calm" />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0, rotate: -4 }}
          animate={{ scale: 1, opacity: 1, rotate: -2 }}
          transition={{ type: "spring", stiffness: 260, damping: 15 }}
          className="border-4 border-black bg-accent-secondary p-4 text-center shadow-(--shadow-brutal-lg)"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-black/70">Room code</p>
          <p className="font-(--font-display) text-4xl uppercase tracking-widest">{roomCode}</p>
        </motion.div>

        <ul className="flex flex-col gap-2">
          {players.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0, rotate: i % 2 === 0 ? 0.5 : -0.5 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: i * 0.05 }}
              className="flex items-center justify-between border-4 border-black bg-white px-3 py-2 font-bold"
              style={{ borderLeft: `10px solid ${PLAYER_COLORS[i % PLAYER_COLORS.length]}` }}
            >
              <span>{p.nickname}</span>
              {p.isHost && (
                <span className="border-2 border-black bg-accent-quaternary px-2 py-0.5 text-xs font-black uppercase text-white">
                  Host
                </span>
              )}
            </motion.li>
          ))}
        </ul>

        {isHost && (
          <div className="flex flex-col gap-4 border-4 border-black bg-white p-4 shadow-(--shadow-brutal)">
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05, rotate: -1 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => selectMode("timed")}
                className={`flex-1 border-4 border-black py-2 font-(--font-display) uppercase tracking-wide ${
                  mode === "timed" ? "bg-accent-primary text-white" : "bg-white"
                }`}
              >
                Timed
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05, rotate: 1 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => selectMode("infinite")}
                className={`flex-1 border-4 border-black py-2 font-(--font-display) uppercase tracking-wide ${
                  mode === "infinite" ? "bg-accent-tertiary text-black" : "bg-white"
                }`}
              >
                Infinite
              </motion.button>
            </div>
            {mode === "timed" && (
              <label className="flex items-center justify-between text-sm font-bold uppercase">
                Round duration (min)
                <input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={roundDurationMin}
                  onChange={(e) => setRoundDurationMin(Number(e.target.value))}
                  onBlur={() => saveSettings(mode, roundDurationMin)}
                  className="w-20 border-4 border-black px-2 py-1 text-center"
                />
              </label>
            )}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={startGame}
              disabled={players.length < 2 || starting}
              className="border-4 border-black bg-accent-blue px-4 py-3 font-(--font-display) uppercase tracking-wide text-white shadow-(--shadow-brutal) transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-(--shadow-brutal-lg) disabled:opacity-50"
            >
              {players.length < 2 ? "Need 2+ players" : starting ? "Starting..." : "Start Game"}
            </motion.button>
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
    </>
  );
}
```

Note: this replaces the JSX return only — keep the `PLAYER_COLORS` constant, `LobbyProps` interface, and all handler functions from Task 3 as-is above this return.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/Lobby.tsx
git commit -m "feat: add calm BackgroundFX and spring entrances to Lobby"
```

---

### Task 6: Wire BackgroundFX + timer urgency + juiced tiles/keyboard into round play

**Files:**
- Modify: `components/RoundPlay.tsx`
- Modify: `components/Timer.tsx`
- Modify: `components/GameBoard.tsx`
- Modify: `components/Keyboard.tsx`

**Interfaces:**
- Consumes: `BackgroundFX` from Task 4.
- Produces: `Timer` now also accepts an optional `onUrgencyChange?: (urgent: boolean) => void` callback so `RoundPlay` can escalate `BackgroundFX` intensity when time is low.

- [ ] **Step 1: Add urgency callback to Timer**

Modify `components/Timer.tsx` — update the props interface and effect:

```typescript
"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  roundEndsAt: number | null;
  roundDurationMs: number;
  onExpire: () => void;
  onUrgencyChange?: (urgent: boolean) => void;
}

export function Timer({ roundEndsAt, roundDurationMs, onExpire, onUrgencyChange }: TimerProps) {
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

  const percent =
    roundEndsAt === null ? 100 : Math.min(100, Math.max(0, (remainingMs / roundDurationMs) * 100));
  const urgent = roundEndsAt !== null && percent < 25;

  useEffect(() => {
    onUrgencyChange?.(urgent);
  }, [urgent, onUrgencyChange]);

  if (roundEndsAt === null) {
    return (
      <div className="w-full max-w-md border-4 border-black bg-accent-tertiary px-3 py-2 text-center shadow-(--shadow-brutal)">
        <p className="font-(--font-display) text-lg uppercase tracking-widest">
          ∞ No Clock
        </p>
      </div>
    );
  }

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div
      className={`w-full max-w-md border-4 border-black bg-white shadow-(--shadow-brutal) ${
        urgent ? "animate-pulse" : ""
      }`}
    >
      <div className="h-4 w-full overflow-hidden border-b-4 border-black bg-white">
        <div
          className={`h-full transition-[width] duration-200 ease-linear ${urgent ? "bg-accent-primary" : "bg-accent-blue"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="py-1 text-center font-(--font-display) text-lg uppercase">
        {seconds}s
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Bouncier tile flip in GameBoard**

In `components/GameBoard.tsx`, update the submitted-tile `motion.div` animation (currently lines 45–53):

```typescript
              return (
                <motion.div
                  key={colIndex}
                  initial={{ rotateX: 0, scale: 1 }}
                  animate={{ rotateX: [0, 90, 0], scale: [1, 1.15, 1] }}
                  transition={{
                    duration: 0.5,
                    delay: colIndex * 0.15,
                    times: [0, 0.5, 1],
                    ease: ["easeIn", "backOut"],
                  }}
                  className={`flex h-12 w-12 items-center justify-center border-4 text-2xl font-black shadow-[3px_3px_0_#000] sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
                >
                  {letter}
                </motion.div>
              );
```

- [ ] **Step 3: Squash-and-stretch keys in Keyboard**

In `components/Keyboard.tsx`, add `whileTap` to all three button types. Update imports and buttons:

```typescript
"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";
```

Replace the Enter button:

```typescript
          {rowIndex === 2 && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress("ENTER")}
              className="border-4 border-black bg-white px-3 py-3 text-xs font-black uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
            >
              Enter
            </motion.button>
          )}
```

Replace the letter buttons:

```typescript
          {row.split("").map((letter) => (
            <motion.button
              key={letter}
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress(letter)}
              className={`border-4 border-black px-2.5 py-3 text-sm font-black shadow-[2px_2px_0_#000] disabled:opacity-50 ${
                keyStates[letter] ? KEY_COLORS[keyStates[letter]] : "bg-white"
              }`}
            >
              {letter}
            </motion.button>
          ))}
```

Replace the Del button:

```typescript
          {rowIndex === 2 && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress("BACKSPACE")}
              className="border-4 border-black bg-white px-3 py-3 text-xs font-black uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
            >
              Del
            </motion.button>
          )}
```

- [ ] **Step 4: Wire BackgroundFX + urgency escalation + confetti pop into RoundPlay**

Replace the full content of `components/RoundPlay.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { GameBoard } from "./GameBoard";
import { Keyboard } from "./Keyboard";
import { Timer } from "./Timer";
import { BackgroundFX } from "./BackgroundFX";
import type { GuessDoc, RoundDoc } from "@/lib/game/types";

interface RoundPlayProps {
  roomCode: string;
  myPlayerId: string;
  round: RoundDoc;
  roundDurationMs: number;
  myGuess: GuessDoc | null;
}

export function RoundPlay({
  roomCode,
  myPlayerId,
  round,
  roundDurationMs,
  myGuess,
}: RoundPlayProps) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urgent, setUrgent] = useState(false);

  const attempts = myGuess?.attempts ?? [];
  const solved = myGuess?.solved ?? false;
  const outOfAttempts = attempts.length >= 6;
  const canPlay = !solved && !outOfAttempts;

  useEffect(() => {
    if (!solved) return;
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
  }, [solved]);

  async function submitGuess(word: string) {
    if (word.length !== 5 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: myPlayerId, word }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid guess");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      }
      setCurrentGuess("");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyPress(key: string) {
    if (!canPlay) return;
    if (key === "ENTER") {
      submitGuess(currentGuess);
      return;
    }
    if (key === "BACKSPACE") {
      setCurrentGuess((g) => g.slice(0, -1));
      return;
    }
    if (/^[A-Z]$/.test(key) && currentGuess.length < 5) {
      setCurrentGuess((g) => g + key);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") handleKeyPress("ENTER");
      else if (e.key === "Backspace") handleKeyPress("BACKSPACE");
      else if (/^[a-zA-Z]$/.test(e.key)) handleKeyPress(e.key.toUpperCase());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleTimerExpire() {
    await fetch(`/api/rooms/${roomCode}/round/check`, { method: "POST" });
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <BackgroundFX intensity={urgent ? "max" : "energetic"} />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <Timer
          roundEndsAt={round.roundEndsAt}
          roundDurationMs={roundDurationMs}
          onExpire={handleTimerExpire}
          onUrgencyChange={setUrgent}
        />
        <motion.div
          animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <GameBoard attempts={attempts} currentGuess={canPlay ? currentGuess : ""} />
        </motion.div>
        {solved && (
          <motion.p
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="border-4 border-black bg-tile-correct px-4 py-2 font-(--font-display) uppercase text-white shadow-(--shadow-brutal)"
          >
            You solved it! Waiting for others...
          </motion.p>
        )}
        {outOfAttempts && !solved && (
          <p className="border-4 border-black bg-white px-4 py-2 font-(--font-display) uppercase shadow-(--shadow-brutal)">
            Out of guesses. Waiting for others...
          </p>
        )}
        {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
        <Keyboard attempts={attempts} onKeyPress={handleKeyPress} disabled={!canPlay || submitting} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add components/RoundPlay.tsx components/Timer.tsx components/GameBoard.tsx components/Keyboard.tsx
git commit -m "feat: add energetic BackgroundFX, timer urgency escalation, and juiced tile/key/solve animations"
```

---

### Task 7: Max-intensity BackgroundFX + staggered podium reveal

**Files:**
- Modify: `components/Podium.tsx`

**Interfaces:**
- Consumes: `BackgroundFX` from Task 4 (`intensity="max"`).

- [ ] **Step 1: Replace Podium.tsx**

```typescript
"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc } from "@/lib/game/types";
import { BackgroundFX } from "./BackgroundFX";

interface PodiumProps {
  players: PlayerWithId[];
  isHost: boolean;
  onPlayAgain: () => void;
  resetting: boolean;
  secretWord: string;
  guessesByPlayer: Record<string, GuessDoc>;
}

const PLACE_COLORS: Record<number, string> = {
  1: "bg-accent-secondary",
  2: "bg-accent-tertiary",
  3: "bg-accent-quaternary",
};
const PLACE_HEIGHTS: Record<number, string> = {
  1: "h-32",
  2: "h-24",
  3: "h-16",
};
const PLACE_ORDER: Record<number, number> = { 1: 0, 2: 1, 3: 2 };

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
    const interval = setInterval(() => {
      confetti({ particleCount: 40, spread: 60, origin: { x: Math.random(), y: 0.3 } });
    }, 700);
    const stop = setTimeout(() => clearInterval(interval), 2800);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [firstPlaceId]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <BackgroundFX intensity="max" />
      <div className="relative z-10 flex w-full flex-col items-center gap-6">
        <div className="border-4 border-black bg-accent-blue p-4 text-center text-white shadow-(--shadow-brutal-lg)">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">The word was</p>
          <p className="font-(--font-display) text-4xl uppercase tracking-widest">{secretWord}</p>
        </div>
        <h2 className="font-(--font-display) text-3xl uppercase">
          <span className="text-accent-primary">Final</span> Results
        </h2>
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
              <span className="font-(--font-display) text-lg">{p.totalScore}</span>
            </li>
          ))}
        </ul>
        {isHost && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onPlayAgain}
            disabled={resetting}
            className="border-4 border-black bg-accent-primary px-4 py-3 font-(--font-display) uppercase tracking-wide text-white shadow-(--shadow-brutal) transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
          >
            {resetting ? "Resetting..." : "Play Again"}
          </motion.button>
        )}
      </div>
    </div>
  );
}

function PodiumSpot({ player, place }: { player: PlayerWithId; place: number }) {
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 18,
        delay: PLACE_ORDER[place] * 0.15,
      }}
      className="flex flex-col items-center gap-1"
    >
      <span className="text-sm font-bold">{player.nickname}</span>
      <div
        className={`flex w-20 items-start justify-center border-4 border-black pt-2 font-(--font-display) text-2xl shadow-[3px_3px_0_#000] ${PLACE_HEIGHTS[place]} ${PLACE_COLORS[place]}`}
      >
        {place}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/Podium.tsx
git commit -m "feat: add max-intensity BackgroundFX, confetti bursts, and staggered podium reveal"
```

---

### Task 8: Spring-physics toast entrances

**Files:**
- Modify: `components/Toast.tsx`

**Interfaces:**
- No interface changes — `ToastStackProps` unchanged.

- [ ] **Step 1: Update the motion.div transition in Toast.tsx**

Replace the `motion.div` block (currently lines 15–26):

```typescript
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -24, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`border-4 border-black px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0_#000] ${
              toast.kind === "left" ? "bg-accent-primary text-white" : "bg-accent-tertiary text-black"
            }`}
          >
            {toast.text}
          </motion.div>
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/Toast.tsx
git commit -m "feat: add spring-physics entrance/exit to toasts"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass, including the updated `lib/game/validation.test.ts`.

- [ ] **Step 2: Run full type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors (fix any issues surfaced by the new JSX/motion usage before proceeding).

- [ ] **Step 4: Manual dev-server verification**

Run: `npm run dev`

With the dev server running and a real Firestore connection (per `.env`):
1. Create a room, join with a second browser/incognito tab as a second player.
2. As host, set mode to Timed, set duration to e.g. 1.5 minutes, click Start.
3. Confirm the Timer shows ~90s and actually counts down for 90 seconds before ending the round (not 30s).
4. Confirm BackgroundFX floating emoji are visible and don't block clicking tiles/keyboard/buttons.
5. Get time below 25% remaining and confirm the timer pulses and background motion speeds up.
6. Solve the word and confirm a confetti burst fires.
7. Let the round finish and reach the Podium screen; confirm confetti cannon + staggered podium bars + max background chaos.
8. Switch mode to Infinite in a new room and confirm "∞ No Clock" still displays and the round never auto-ends.

- [ ] **Step 5: Commit any fixes found during manual verification**

If manual verification surfaces issues, fix them and commit with an appropriately scoped message (e.g. `fix: <specific issue found during manual verification>`).

---

## Self-Review Notes

- **Spec coverage:** Part 1 (schema bounds, atomic start persistence, minutes UI) — Tasks 1–3. Part 2 (BackgroundFX, escalating intensity, tile/keyboard/button/toast/podium micro-interactions, confetti) — Tasks 4–8. Testing section of spec — Task 9.
- **No placeholders:** every step has complete, copy-pasteable code or an exact command with expected output.
- **Type consistency:** `Timer`'s new `onUrgencyChange` prop is defined in Task 6 Step 1 and consumed in the same task's Step 4 (`RoundPlay`) — no cross-task drift. `BackgroundFX`'s `intensity` prop (`"calm" | "energetic" | "max"`) defined in Task 4 is used identically in Tasks 5, 6, and 7. `startRoomSchema` shape defined in Task 1 matches exactly what Task 2's route and Task 3's Lobby fetch call produce/consume.
