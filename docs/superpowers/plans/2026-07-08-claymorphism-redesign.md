# Claymorphism Redesign + Live Opponents Panel + Simplified Podium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the neo-brutalist visual language (hard black borders, offset shadows) with claymorphism (soft rounded shapes, puffy soft shadows) across every screen, add a desktop-only live opponents progress panel during rounds, simplify the Podium into a ranked card list emphasizing solve speed, and audit mobile responsiveness throughout.

**Architecture:** Part 1 replaces shared CSS tokens in `globals.css` and swaps `border-4 border-black` / `shadow-(--shadow-brutal*)` for rounded/soft-shadow classes across every component — a mechanical, visual-only pass with no logic changes. Part 2 adds a new `OpponentsPanel` component fed by widening an existing hook's enabled condition (no new Firestore reads, no rules changes — reads are already open). Part 3 reworks `Podium.tsx`'s rendering to a ranked list derived from data that already exists (`submittedAt`, `startedAt`). Part 4 is a responsiveness check folded into the tasks that touch each screen.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, framer-motion, canvas-confetti, Firebase/Firestore, Vitest.

## Global Constraints

- No WebGL/3D library — claymorphism is CSS-only (soft shadows, rounded corners, press effects).
- Keep the existing color palette (`--accent-primary` etc. in `app/globals.css`) unchanged — restyle material/shape only, not colors.
- No new npm dependencies.
- No Firestore schema or security-rules changes — `firestore.rules` already allows open reads on the `guesses` subcollection at all times.
- No scoring-logic changes — `totalScore`-based ranking stays primary; time/attempts are additional displayed stats and a visual tiebreaker highlight only.
- `OpponentsPanel` must never reveal opponents' actual guessed letters — only aggregate tile-color counts from their most recent attempt.
- `OpponentsPanel` must be completely absent from the DOM (not just visually hidden) below the `lg` breakpoint, via Tailwind's `hidden lg:flex` pattern.

---

### Task 1: Claymorphism design tokens in `globals.css`

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: new CSS custom properties `--shadow-clay`, `--shadow-clay-inset`, `--shadow-clay-pressed`, `--radius-clay`, available to every component via `shadow-(--shadow-clay)` / `rounded-[var(--radius-clay)]` Tailwind arbitrary-value syntax (the same syntax pattern already used successfully for `shadow-(--shadow-brutal)` elsewhere in the codebase — note: unlike the `font-(--font-display)` bug fixed in a prior session, `shadow-(...)` arbitrary-value syntax is unambiguous in Tailwind v4 since there's no competing `shadow-*` weight-style utility, so this pattern is safe to keep using here).

- [ ] **Step 1: Add clay shadow/radius tokens, keep brutal tokens for the transition**

Replace the full content of `app/globals.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: light;
  --surface: #fdf6e9;
  --ink: #000000;
  --accent-primary: #ff3d3d;
  --accent-secondary: #ffd600;
  --accent-tertiary: #00e0d3;
  --accent-quaternary: #ff2fb0;
  --accent-blue: #2f6bff;
  --tile-correct: #00c853;
  --tile-present: #ffd600;
  --tile-absent: #6b6b6b;
  --shadow-brutal: 5px 5px 0 #000000;
  --shadow-brutal-lg: 8px 8px 0 #000000;
  --shadow-clay: 8px 8px 16px rgba(0, 0, 0, 0.12), -4px -4px 12px rgba(255, 255, 255, 0.7);
  --shadow-clay-lg: 12px 12px 24px rgba(0, 0, 0, 0.14), -6px -6px 16px rgba(255, 255, 255, 0.75);
  --shadow-clay-sm: 4px 4px 8px rgba(0, 0, 0, 0.1), -2px -2px 6px rgba(255, 255, 255, 0.6);
  --shadow-clay-pressed: inset 4px 4px 8px rgba(0, 0, 0, 0.15), inset -2px -2px 6px rgba(255, 255, 255, 0.5);
  --radius-clay: 1.5rem;
}

@theme inline {
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-accent-primary: var(--accent-primary);
  --color-accent-secondary: var(--accent-secondary);
  --color-accent-tertiary: var(--accent-tertiary);
  --color-accent-quaternary: var(--accent-quaternary);
  --color-accent-blue: var(--accent-blue);
  --color-tile-correct: var(--tile-correct);
  --color-tile-present: var(--tile-present);
  --color-tile-absent: var(--tile-absent);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-bungee);
}

body {
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

Note: `--shadow-brutal`/`--shadow-brutal-lg` are kept (not deleted) because removing them would break any component not yet migrated within this same commit; Task 8 removes them once every consumer is migrated.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors (CSS-only change, but confirms no build break).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add claymorphism shadow and radius tokens alongside brutalist tokens"
```

---

### Task 2: Restyle home page and JoinInline as clay

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/JoinInline.tsx`

**Interfaces:**
- Consumes: `--shadow-clay`, `--shadow-clay-lg`, `--radius-clay` tokens from Task 1.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
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
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-surface p-6">
      <div className="pointer-events-none absolute top-10 left-8 h-16 w-16 rotate-12 rounded-3xl bg-accent-tertiary shadow-(--shadow-clay-sm) sm:h-24 sm:w-24" />
      <div className="pointer-events-none absolute right-10 bottom-16 h-20 w-20 -rotate-12 rounded-full bg-accent-quaternary shadow-(--shadow-clay-sm) sm:h-28 sm:w-28" />
      <div className="pointer-events-none absolute top-1/3 right-6 h-10 w-10 rotate-45 rounded-2xl bg-accent-secondary shadow-(--shadow-clay-sm) sm:h-14 sm:w-14" />

      <h1 className="relative font-display text-5xl uppercase text-ink sm:text-6xl">
        <span className="text-accent-primary">Wordle</span> Arena
      </h1>
      <form
        onSubmit={handleCreateRoom}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-clay)] bg-white p-5 shadow-(--shadow-clay-lg)"
      >
        <input
          className="rounded-2xl bg-surface px-3 py-2 font-bold shadow-(--shadow-clay-pressed) placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-blue"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl bg-accent-primary px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
        <a
          href="/join"
          className="text-center text-sm font-bold uppercase text-accent-blue underline decoration-2 underline-offset-4"
        >
          Have a room code? Join instead
        </a>
        {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
      </form>

      <footer className="relative mt-4 text-center text-sm font-bold uppercase tracking-wide text-ink/70">
        Made with ❤️ by{" "}
        <a
          href="https://github.com/FlashL3opard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-blue underline decoration-2 underline-offset-4 hover:text-accent-primary"
        >
          FlashL3opard
        </a>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Replace `components/JoinInline.tsx`**

```tsx
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
      className="flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-clay)] bg-white p-5 shadow-(--shadow-clay-lg)"
    >
      <p className="text-center font-display text-2xl uppercase tracking-wide">
        Join room <span className="text-accent-blue">{roomCode}</span>
      </p>
      <input
        className="rounded-2xl bg-surface px-3 py-2 font-bold shadow-(--shadow-clay-pressed) placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-tertiary"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-2xl bg-accent-blue px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Room"}
      </button>
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/JoinInline.tsx
git commit -m "feat: restyle home page and join form as claymorphism"
```

---

### Task 3: Restyle Lobby as clay (mobile-safe)

**Files:**
- Modify: `components/Lobby.tsx`

**Interfaces:**
- Consumes: `--shadow-clay`, `--radius-clay` tokens from Task 1. No prop/behavior changes — `LobbyProps` and all handlers stay identical to current.

- [ ] **Step 1: Replace `components/Lobby.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GameMode, RoomDoc } from "@/lib/game/types";
import { BackgroundFX } from "./BackgroundFX";

const PLAYER_COLORS = ["#ff3d3d", "#2f6bff", "#00e0d3", "#ff2fb0", "#ffd600", "#00c853"];

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

  return (
    <>
      <BackgroundFX intensity="calm" />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-4 px-1">
        <motion.div
          initial={{ scale: 0.8, opacity: 0, rotate: -4 }}
          animate={{ scale: 1, opacity: 1, rotate: -2 }}
          transition={{ type: "spring", stiffness: 260, damping: 15 }}
          className="rounded-[var(--radius-clay)] bg-accent-secondary p-4 text-center shadow-(--shadow-clay-lg)"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-black/70">Room code</p>
          <p className="font-display text-3xl uppercase tracking-widest sm:text-4xl">{roomCode}</p>
        </motion.div>

        <ul className="flex flex-col gap-2">
          {players.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0, rotate: i % 2 === 0 ? 0.5 : -0.5 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: i * 0.05 }}
              className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 font-bold shadow-(--shadow-clay-sm)"
              style={{ borderLeft: `10px solid ${PLAYER_COLORS[i % PLAYER_COLORS.length]}` }}
            >
              <span className="truncate">{p.nickname}</span>
              {p.isHost && (
                <span className="shrink-0 rounded-full bg-accent-quaternary px-2 py-0.5 text-xs font-black uppercase text-white">
                  Host
                </span>
              )}
            </motion.li>
          ))}
        </ul>

        {isHost && (
          <div className="flex flex-col gap-4 rounded-[var(--radius-clay)] bg-white p-4 shadow-(--shadow-clay)">
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05, rotate: -1 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => selectMode("timed")}
                className={`flex-1 rounded-2xl py-2 font-display uppercase tracking-wide transition-shadow ${
                  mode === "timed"
                    ? "bg-accent-primary text-white shadow-(--shadow-clay-pressed)"
                    : "bg-surface shadow-(--shadow-clay-sm)"
                }`}
              >
                Timed
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05, rotate: 1 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => selectMode("infinite")}
                className={`flex-1 rounded-2xl py-2 font-display uppercase tracking-wide transition-shadow ${
                  mode === "infinite"
                    ? "bg-accent-tertiary text-black shadow-(--shadow-clay-pressed)"
                    : "bg-surface shadow-(--shadow-clay-sm)"
                }`}
              >
                Infinite
              </motion.button>
            </div>
            {mode === "timed" && (
              <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold uppercase">
                Round duration (min)
                <input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={roundDurationMin}
                  onChange={(e) => setRoundDurationMin(Number(e.target.value))}
                  onBlur={() => saveSettings(mode, roundDurationMin)}
                  className="w-20 rounded-xl bg-surface px-2 py-1 text-center shadow-(--shadow-clay-pressed)"
                />
              </label>
            )}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={startGame}
              disabled={players.length < 2 || starting}
              className="rounded-2xl bg-accent-blue px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
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

Mobile-safety notes applied: room code text drops to `text-3xl` on narrow screens (was fixed `text-4xl`), player row nickname gets `truncate` + host badge gets `shrink-0` so long nicknames don't push the badge off-screen, duration label wraps via `flex-wrap` instead of forcing a single line.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/Lobby.tsx
git commit -m "feat: restyle Lobby as claymorphism with mobile-safe wrapping"
```

---

### Task 4: Restyle GameBoard, Keyboard, and Timer as clay

**Files:**
- Modify: `components/GameBoard.tsx`
- Modify: `components/Keyboard.tsx`
- Modify: `components/Timer.tsx`

**Interfaces:**
- Consumes: `--shadow-clay*` tokens from Task 1. No prop changes to any of the three components.

- [ ] **Step 1: Replace `components/GameBoard.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";

interface GameBoardProps {
  attempts: GuessAttempt[];
  currentGuess: string;
  maxAttempts?: number;
  wordLength?: number;
}

const TILE_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct text-white",
  yellow: "bg-tile-present text-black",
  gray: "bg-tile-absent text-white",
};

type Row =
  | { kind: "submitted"; attempt: GuessAttempt }
  | { kind: "current" }
  | { kind: "empty" };

export function GameBoard({
  attempts,
  currentGuess,
  maxAttempts = 6,
  wordLength = 5,
}: GameBoardProps) {
  const rows: Row[] = Array.from({ length: maxAttempts }, (_, rowIndex) => {
    if (rowIndex < attempts.length) return { kind: "submitted", attempt: attempts[rowIndex] };
    if (rowIndex === attempts.length) return { kind: "current" };
    return { kind: "empty" };
  });

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {Array.from({ length: wordLength }, (_, colIndex) => {
            if (row.kind === "submitted") {
              const letter = row.attempt.word[colIndex]?.toUpperCase() ?? "";
              const color = row.attempt.tiles[colIndex];
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
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl font-black shadow-(--shadow-clay-sm) sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
                >
                  {letter}
                </motion.div>
              );
            }
            if (row.kind === "current") {
              const letter = currentGuess[colIndex]?.toUpperCase() ?? "";
              return (
                <div
                  key={colIndex}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl font-black sm:h-14 sm:w-14 ${
                    letter ? "bg-accent-secondary/30 shadow-(--shadow-clay-pressed)" : "bg-surface shadow-(--shadow-clay-pressed)"
                  }`}
                >
                  {letter}
                </div>
              );
            }
            return (
              <div
                key={colIndex}
                className="h-11 w-11 rounded-xl bg-surface shadow-(--shadow-clay-pressed) sm:h-14 sm:w-14"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

Mobile-safety note: tile size dropped from `h-12 w-12` to `h-11 w-11` at the base (small-screen) breakpoint to keep 5 tiles + gaps comfortably within a 360px viewport once padding is accounted for; `sm:h-14 sm:w-14` unchanged for larger screens.

- [ ] **Step 2: Replace `components/Keyboard.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";

interface KeyboardProps {
  attempts: GuessAttempt[];
  onKeyPress: (key: string) => void;
  disabled?: boolean;
}

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const COLOR_PRIORITY: Record<TileColor, number> = { gray: 0, yellow: 1, green: 2 };

function computeKeyStates(attempts: GuessAttempt[]): Record<string, TileColor> {
  const states: Record<string, TileColor> = {};
  for (const attempt of attempts) {
    for (let i = 0; i < attempt.word.length; i++) {
      const letter = attempt.word[i].toUpperCase();
      const color = attempt.tiles[i];
      const current = states[letter];
      if (!current || COLOR_PRIORITY[color] > COLOR_PRIORITY[current]) {
        states[letter] = color;
      }
    }
  }
  return states;
}

const KEY_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct text-white",
  yellow: "bg-tile-present text-black",
  gray: "bg-tile-absent text-white",
};

export function Keyboard({ attempts, onKeyPress, disabled }: KeyboardProps) {
  const keyStates = computeKeyStates(attempts);

  return (
    <div className="flex flex-col gap-1.5">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1">
          {rowIndex === 2 && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress("ENTER")}
              className="rounded-lg bg-white px-2 py-3 text-xs font-black uppercase shadow-(--shadow-clay-sm) disabled:opacity-50 sm:px-3"
            >
              Enter
            </motion.button>
          )}
          {row.split("").map((letter) => (
            <motion.button
              key={letter}
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress(letter)}
              className={`rounded-lg px-2 py-3 text-sm font-black shadow-(--shadow-clay-sm) disabled:opacity-50 sm:px-2.5 ${
                keyStates[letter] ? KEY_COLORS[keyStates[letter]] : "bg-white"
              }`}
            >
              {letter}
            </motion.button>
          ))}
          {rowIndex === 2 && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress("BACKSPACE")}
              className="rounded-lg bg-white px-2 py-3 text-xs font-black uppercase shadow-(--shadow-clay-sm) disabled:opacity-50 sm:px-3"
            >
              Del
            </motion.button>
          )}
        </div>
      ))}
    </div>
  );
}
```

Mobile-safety note: key horizontal padding drops from `px-2.5`/`px-3` to `px-2` at the base breakpoint (`sm:` restores the larger padding) so the 10-key top row fits on a 360px-wide screen without horizontal scroll.

- [ ] **Step 3: Replace `components/Timer.tsx`**

```tsx
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
      <div className="w-full max-w-md rounded-[var(--radius-clay)] bg-accent-tertiary px-3 py-2 text-center shadow-(--shadow-clay)">
        <p className="font-display text-lg uppercase tracking-widest">
          ∞ No Clock
        </p>
      </div>
    );
  }

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div
      className={`w-full max-w-md rounded-[var(--radius-clay)] bg-white shadow-(--shadow-clay) ${
        urgent ? "animate-pulse" : ""
      }`}
    >
      <div className="mx-2 mt-2 h-4 w-[calc(100%-1rem)] overflow-hidden rounded-full bg-surface shadow-(--shadow-clay-pressed)">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${urgent ? "bg-accent-primary" : "bg-accent-blue"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="py-1 text-center font-display text-lg uppercase">
        {seconds}s
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/GameBoard.tsx components/Keyboard.tsx components/Timer.tsx
git commit -m "feat: restyle GameBoard, Keyboard, and Timer as claymorphism with mobile-safe sizing"
```

---

### Task 5: Widen `useRoundGuesses` to live during rounds + create `OpponentsPanel`

**Files:**
- Modify: `app/room/[code]/page.tsx:35-39` (widen the `enabled` condition)
- Create: `components/OpponentsPanel.tsx`

**Interfaces:**
- Consumes: `useRoundGuesses(roomCode, roundNumber, enabled)` (unchanged signature, from `hooks/useRoundGuesses.ts`), `PlayerWithId` (from `@/store/useRoomStore`), `GuessDoc`/`TileColor` (from `@/lib/game/types`).
- Produces: `OpponentsPanel({ players, myPlayerId, guessesByPlayer }: OpponentsPanelProps)` — a named export other tasks (Task 6) import as `import { OpponentsPanel } from "./OpponentsPanel";`.

- [ ] **Step 1: Widen the `useRoundGuesses` enabled condition in `app/room/[code]/page.tsx`**

Change line 35-39 from:

```tsx
  const guessesByPlayer = useRoundGuesses(
    roomCode,
    ROUND_NUMBER,
    room?.status === "finished"
  );
```

to:

```tsx
  const guessesByPlayer = useRoundGuesses(
    roomCode,
    ROUND_NUMBER,
    room?.status === "in_round" || room?.status === "finished"
  );
```

- [ ] **Step 2: Pass `players` and `guessesByPlayer` into `RoundPlay` in the same file**

Change the `RoundPlay` usage (currently lines 107-115) from:

```tsx
      {room.status === "in_round" && round && (
        <RoundPlay
          roomCode={roomCode}
          myPlayerId={myPlayerId}
          round={round}
          roundDurationMs={room.roundDurationMs}
          myGuess={myGuess}
        />
      )}
```

to:

```tsx
      {room.status === "in_round" && round && (
        <RoundPlay
          roomCode={roomCode}
          myPlayerId={myPlayerId}
          round={round}
          roundDurationMs={room.roundDurationMs}
          myGuess={myGuess}
          players={players}
          guessesByPlayer={guessesByPlayer}
        />
      )}
```

(`players` is already destructured from `useRoomStore` at line 31 of this file — no new import needed. `RoundPlay`'s prop type is extended in Task 6.)

- [ ] **Step 3: Create `components/OpponentsPanel.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc, TileColor } from "@/lib/game/types";

interface OpponentsPanelProps {
  players: PlayerWithId[];
  myPlayerId: string;
  guessesByPlayer: Record<string, GuessDoc>;
}

const TILE_DOT_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct",
  yellow: "bg-tile-present",
  gray: "bg-tile-absent",
};

export function OpponentsPanel({ players, myPlayerId, guessesByPlayer }: OpponentsPanelProps) {
  const opponents = players.filter((p) => p.id !== myPlayerId);

  if (opponents.length === 0) return null;

  return (
    <div className="hidden w-56 flex-col gap-3 lg:flex">
      <p className="text-xs font-bold uppercase tracking-widest text-ink/60">Opponents</p>
      {opponents.map((player) => {
        const guess = guessesByPlayer[player.id];
        const lastAttempt = guess?.attempts[guess.attempts.length - 1];
        const tiles = lastAttempt?.tiles ?? [];

        return (
          <motion.div
            key={player.id}
            layout
            className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 shadow-(--shadow-clay-sm)"
          >
            <span className="truncate text-sm font-bold">{player.nickname}</span>
            <span className="flex shrink-0 items-center gap-1">
              {guess?.solved ? (
                <span className="rounded-full bg-tile-correct px-2 py-0.5 text-[10px] font-black uppercase text-white">
                  Solved
                </span>
              ) : (
                Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full ${tiles[i] ? TILE_DOT_COLORS[tiles[i]] : "bg-surface shadow-(--shadow-clay-pressed)"}`}
                  />
                ))
              )}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors (note: `RoundPlay`'s prop type doesn't yet accept `players`/`guessesByPlayer` until Task 6 — this step's type check is expected to FAIL here with "Property 'players' does not exist on type IntrinsicAttributes & RoundPlayProps" until Task 6 lands; that's fine, this task's own new file `OpponentsPanel.tsx` has no errors in isolation. Verify with a targeted check instead:)

Run: `npx tsc --noEmit -p . 2>&1 | grep OpponentsPanel`
Expected: no output (no errors specifically in the new file).

- [ ] **Step 5: Commit**

```bash
git add app/room/[code]/page.tsx components/OpponentsPanel.tsx
git commit -m "feat: widen guess subscription to live rounds and add OpponentsPanel component"
```

---

### Task 6: Wire `OpponentsPanel` into `RoundPlay` with desktop side-by-side layout

**Files:**
- Modify: `components/RoundPlay.tsx`

**Interfaces:**
- Consumes: `OpponentsPanel` from `./OpponentsPanel` (Task 5), `PlayerWithId` from `@/store/useRoomStore`.
- Produces: `RoundPlayProps` gains two new required fields: `players: PlayerWithId[]`, `guessesByPlayer: Record<string, GuessDoc>`.

- [ ] **Step 1: Replace `components/RoundPlay.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { GameBoard } from "./GameBoard";
import { Keyboard } from "./Keyboard";
import { Timer } from "./Timer";
import { BackgroundFX } from "./BackgroundFX";
import { OpponentsPanel } from "./OpponentsPanel";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc, RoundDoc } from "@/lib/game/types";

interface RoundPlayProps {
  roomCode: string;
  myPlayerId: string;
  round: RoundDoc;
  roundDurationMs: number;
  myGuess: GuessDoc | null;
  players: PlayerWithId[];
  guessesByPlayer: Record<string, GuessDoc>;
}

export function RoundPlay({
  roomCode,
  myPlayerId,
  round,
  roundDurationMs,
  myGuess,
  players,
  guessesByPlayer,
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
      <div className="relative z-10 flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
        <OpponentsPanel players={players} myPlayerId={myPlayerId} guessesByPlayer={guessesByPlayer} />
        <div className="flex flex-col items-center gap-6">
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
              className="rounded-2xl bg-tile-correct px-4 py-2 font-display uppercase text-white shadow-(--shadow-clay)"
            >
              You solved it! Waiting for others...
            </motion.p>
          )}
          {outOfAttempts && !solved && (
            <p className="rounded-2xl bg-white px-4 py-2 font-display uppercase shadow-(--shadow-clay)">
              Out of guesses. Waiting for others...
            </p>
          )}
          {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
          <Keyboard attempts={attempts} onKeyPress={handleKeyPress} disabled={!canPlay || submitting} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors (this resolves the expected Task 5 Step 4 gap).

- [ ] **Step 3: Commit**

```bash
git add components/RoundPlay.tsx
git commit -m "feat: wire OpponentsPanel into RoundPlay with desktop side-by-side layout"
```

---

### Task 7: Simplify Podium into a ranked card list with time/attempts

**Files:**
- Modify: `components/Podium.tsx`
- Modify: `app/room/[code]/page.tsx:116-125` (pass `roundStartedAt` prop)

**Interfaces:**
- Consumes: `RoundDoc.startedAt`, `GuessDoc.attempts[].submittedAt`, `GuessDoc.solved` (all pre-existing in `lib/game/types.ts`, no schema change).
- Produces: `PodiumProps` gains `roundStartedAt: number`; removes the `PodiumSpot` bar-chart sub-component entirely.

- [ ] **Step 1: Pass `round.startedAt` into `Podium` in `app/room/[code]/page.tsx`**

Change the `Podium` usage (currently lines 116-125) from:

```tsx
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
```

to:

```tsx
      {room.status === "finished" && round && (
        <Podium
          players={players}
          isHost={room.hostPlayerId === myPlayerId}
          onPlayAgain={handlePlayAgain}
          resetting={resetting}
          secretWord={round.secretWord}
          guessesByPlayer={guessesByPlayer}
          roundStartedAt={round.startedAt}
        />
      )}
```

- [ ] **Step 2: Replace `components/Podium.tsx`**

```tsx
"use client";

import { useEffect, useMemo } from "react";
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
  roundStartedAt: number;
}

interface RankedPlayer {
  player: PlayerWithId;
  solved: boolean;
  attempts: number;
  timeMs: number | null;
}

function buildRanking(
  players: PlayerWithId[],
  guessesByPlayer: Record<string, GuessDoc>,
  roundStartedAt: number
): RankedPlayer[] {
  const withStats: RankedPlayer[] = players.map((player) => {
    const guess = guessesByPlayer[player.id];
    const attempts = guess?.attempts.length ?? 0;
    const solved = guess?.solved ?? false;
    const lastAttempt = guess?.attempts[guess.attempts.length - 1];
    const timeMs = solved && lastAttempt ? lastAttempt.submittedAt - roundStartedAt : null;
    return { player, solved, attempts, timeMs };
  });

  return withStats.sort((a, b) => {
    if (b.player.totalScore !== a.player.totalScore) {
      return b.player.totalScore - a.player.totalScore;
    }
    if (a.timeMs !== null && b.timeMs !== null) return a.timeMs - b.timeMs;
    if (a.timeMs !== null) return -1;
    if (b.timeMs !== null) return 1;
    return 0;
  });
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function Podium({
  players,
  isHost,
  onPlayAgain,
  resetting,
  secretWord,
  guessesByPlayer,
  roundStartedAt,
}: PodiumProps) {
  const ranked = useMemo(
    () => buildRanking(players, guessesByPlayer, roundStartedAt),
    [players, guessesByPlayer, roundStartedAt]
  );

  const fastestSolveId = useMemo(() => {
    const solved = ranked.filter((r) => r.timeMs !== null);
    if (solved.length === 0) return null;
    return solved.reduce((fastest, r) => (r.timeMs! < fastest.timeMs! ? r : fastest)).player.id;
  }, [ranked]);

  const firstPlaceId = ranked[0]?.player.id;
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
        <div className="rounded-[var(--radius-clay)] bg-accent-blue p-4 text-center text-white shadow-(--shadow-clay-lg)">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">The word was</p>
          <p className="font-display text-3xl uppercase tracking-widest sm:text-4xl">{secretWord}</p>
        </div>
        <h2 className="font-display text-3xl uppercase">
          <span className="text-accent-primary">Final</span> Results
        </h2>
        <ul className="flex w-full flex-col gap-2">
          {ranked.map((r, i) => (
            <motion.li
              key={r.player.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: i * 0.08 }}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 shadow-(--shadow-clay-sm)"
            >
              <span className="flex min-w-0 items-center gap-2 font-bold">
                <span className="font-display text-lg text-accent-primary">{i + 1}</span>
                <span className="truncate">{r.player.nickname}</span>
                {r.player.id === fastestSolveId && (
                  <span className="shrink-0 rounded-full bg-accent-secondary px-2 py-0.5 text-[10px] font-black uppercase">
                    ⚡ Fastest
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm">
                <span className="text-ink/60">
                  {r.solved ? `${r.attempts} ${r.attempts === 1 ? "try" : "tries"} · ${formatTime(r.timeMs!)}` : "Out of guesses"}
                </span>
                <span className="font-display text-lg">{r.player.totalScore}</span>
              </span>
            </motion.li>
          ))}
        </ul>
        {isHost && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onPlayAgain}
            disabled={resetting}
            className="rounded-2xl bg-accent-primary px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
          >
            {resetting ? "Resetting..." : "Play Again"}
          </motion.button>
        )}
      </div>
    </div>
  );
}
```

Mobile-safety note: each ranked row uses `flex-wrap` with `gap-x-3 gap-y-1`, and nickname gets `truncate` inside a `min-w-0` flex child, so long nicknames + stats + score wrap onto a second line rather than overflowing horizontally on narrow viewports.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/Podium.tsx "app/room/[code]/page.tsx"
git commit -m "feat: simplify Podium into ranked card list with attempts, time, and fastest-solve highlight"
```

---

### Task 8: Restyle Toast and Leaderboard as clay, remove brutalist tokens

**Files:**
- Modify: `components/Toast.tsx`
- Modify: `components/Leaderboard.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- No prop changes to `Toast.tsx` or `Leaderboard.tsx`.
- Removes `--shadow-brutal`, `--shadow-brutal-lg` from `app/globals.css` (safe once this task confirms no remaining consumer — see Step 1).

- [ ] **Step 1: Confirm no remaining `--shadow-brutal` consumers before removing the tokens**

Run: `grep -rn "shadow-brutal\|border-4 border-black" app components --include="*.tsx"`
Expected: no output (every component was migrated in Tasks 2-7). If this prints any matches, stop and migrate that file to clay styling using the same pattern as Task 2-7 before proceeding.

- [ ] **Step 2: Replace `components/Toast.tsx`**

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ToastMessage } from "@/hooks/usePresenceToasts";

interface ToastStackProps {
  toasts: ToastMessage[];
}

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -24, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`rounded-2xl px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-(--shadow-clay) ${
              toast.kind === "left" ? "bg-accent-primary text-white" : "bg-accent-tertiary text-black"
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

- [ ] **Step 3: Replace `components/Leaderboard.tsx`**

```tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PlayerWithId } from "@/store/useRoomStore";

interface LeaderboardProps {
  players: PlayerWithId[];
  pointsThisRound?: Record<string, number>;
}

export function Leaderboard({ players, pointsThisRound }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <ul className="flex w-full flex-col gap-2">
      <AnimatePresence>
        {sorted.map((player, index) => (
          <motion.li
            key={player.id}
            layout
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 font-bold shadow-(--shadow-clay-sm)"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-sm text-gray-500">#{index + 1}</span>
              <span className="truncate">{player.nickname}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {pointsThisRound?.[player.id] != null && (
                <span className="text-xs font-black text-tile-correct">+{pointsThisRound[player.id]}</span>
              )}
              <span className="font-display text-lg">{player.totalScore}</span>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
```

- [ ] **Step 4: Remove brutalist tokens from `app/globals.css`**

Replace the full content of `app/globals.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: light;
  --surface: #fdf6e9;
  --ink: #000000;
  --accent-primary: #ff3d3d;
  --accent-secondary: #ffd600;
  --accent-tertiary: #00e0d3;
  --accent-quaternary: #ff2fb0;
  --accent-blue: #2f6bff;
  --tile-correct: #00c853;
  --tile-present: #ffd600;
  --tile-absent: #6b6b6b;
  --shadow-clay: 8px 8px 16px rgba(0, 0, 0, 0.12), -4px -4px 12px rgba(255, 255, 255, 0.7);
  --shadow-clay-lg: 12px 12px 24px rgba(0, 0, 0, 0.14), -6px -6px 16px rgba(255, 255, 255, 0.75);
  --shadow-clay-sm: 4px 4px 8px rgba(0, 0, 0, 0.1), -2px -2px 6px rgba(255, 255, 255, 0.6);
  --shadow-clay-pressed: inset 4px 4px 8px rgba(0, 0, 0, 0.15), inset -2px -2px 6px rgba(255, 255, 255, 0.5);
  --radius-clay: 1.5rem;
}

@theme inline {
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-accent-primary: var(--accent-primary);
  --color-accent-secondary: var(--accent-secondary);
  --color-accent-tertiary: var(--accent-tertiary);
  --color-accent-quaternary: var(--accent-quaternary);
  --color-accent-blue: var(--accent-blue);
  --color-tile-correct: var(--tile-correct);
  --color-tile-present: var(--tile-present);
  --color-tile-absent: var(--tile-absent);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-bungee);
}

body {
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/Toast.tsx components/Leaderboard.tsx app/globals.css
git commit -m "feat: restyle Toast and Leaderboard as claymorphism, remove brutalist tokens"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all existing tests pass unchanged (this plan makes no scoring/logic changes — `lib/game/scoring.test.ts` and others should be unaffected).

- [ ] **Step 2: Run full type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm no leftover brutalist classes anywhere**

Run: `grep -rn "shadow-brutal\|border-4 border-black" app components --include="*.tsx"`
Expected: no output.

- [ ] **Step 4: Manual dev-server verification**

Run: `npm run dev`

With the dev server running and a real Firestore connection:
1. Load the home page — confirm rounded clay-style card, soft shadows, no hard black borders visible.
2. Create a room, join with a second browser tab as a second player — confirm Lobby renders with clay styling and no horizontal overflow at a 360px-wide viewport (browser devtools mobile emulation).
3. Start a timed round with 2+ players — confirm on a desktop-width viewport (≥1024px) the `OpponentsPanel` appears to the side showing the second player's tile-color dots as they guess (not their letters). Confirm at mobile width (<1024px) the panel is completely absent (inspect DOM — element should not be rendered, not just `display: none`... actually `hidden` in Tailwind IS `display:none` which is acceptable per the spec's intent of "not visually shown"; confirm via devtools that it has `display: none` and doesn't affect layout width).
4. Let the round finish (or force via out-of-guesses) — confirm the Podium shows a single ranked list with attempts/time per player, and the fastest solver has a "⚡ Fastest" badge.
5. Confirm claymorphism styling (rounded corners, soft shadows, no hard black borders) is consistent across Lobby, RoundPlay (tiles/keyboard/timer), and Podium.
6. Resize to 360px width at each screen (Lobby, RoundPlay, Podium) and confirm no horizontal scrollbar appears.

- [ ] **Step 5: Commit any fixes found during manual verification**

If manual verification surfaces issues, fix them and commit with an appropriately scoped message (e.g. `fix: <specific issue found during manual verification>`).

---

## Self-Review Notes

- **Spec coverage:** Part 1 (claymorphism tokens + restyle) — Tasks 1-4, 8. Part 2 (live opponents panel) — Tasks 5-6. Part 3 (simplified Podium) — Task 7. Part 4 (mobile responsiveness) — folded into Tasks 2, 3, 4, 7 via explicit "mobile-safety note" callouts, verified in Task 9.
- **No placeholders:** every step has complete, copy-pasteable code or an exact command with expected output.
- **Type consistency:** `OpponentsPanelProps` defined in Task 5 (`players`, `myPlayerId`, `guessesByPlayer`) matches exactly how Task 6 calls `<OpponentsPanel players={players} myPlayerId={myPlayerId} guessesByPlayer={guessesByPlayer} />`. `RoundPlayProps` gains `players`/`guessesByPlayer` in Task 6, matching exactly what Task 5 Step 2 passes from `app/room/[code]/page.tsx`. `PodiumProps` gains `roundStartedAt` in Task 7, matching exactly what that same task's Step 1 passes.
- **Sequencing:** Task 5 intentionally introduces a transient type error (flagged explicitly in its Step 4) that Task 6 resolves in the same logical unit of work — both tasks must land together before the codebase type-checks cleanly, which is why Task 9's full verification pass exists as the final gate.
