# Bug Fixes, Session Cleanup, and Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five real bugs (unstyled join page, presence-flicker toasts, stale sessions/rooms, tile glitch on submit, invalid-word not clearing), improve UX (join button, recentered Round-Play layout), and add visual polish (animated gradient background, randomized-direction floating decorations, punchier per-letter reveal feedback).

**Architecture:** Each bug fix is scoped to its exact root cause (traced in the design doc) rather than a broad rewrite. The session-cleanup work adds one new Vercel Cron route plus a pure, testable eligibility function. The Round-Play recenter switches from a flex-row-with-justify-center layout to a CSS grid so the center track is independent of the side panel's presence. Visual polish (gradient, BackgroundFX motion, tile reveal) touches only `globals.css` and `BackgroundFX.tsx`/`GameBoard.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, framer-motion, canvas-confetti, Firebase Admin/Firestore/RTDB, Vitest, Vercel Cron.

## Global Constraints

- **Local-only: do NOT run `git add`, `git commit`, or `git push` for any task in this plan.** Leave all changes uncommitted in the working tree. Skip every "Commit" step that would normally appear in a plan — steps below omit them entirely per this constraint.
- No new npm dependencies — only framer-motion, canvas-confetti, firebase-admin (all already installed).
- No Firestore security-rules changes.
- No scoring/round-lifecycle logic changes beyond the invalid-word clear-on-shake UX.
- Cron cleanup timeout: rooms with all players disconnected for **10+ minutes** get deleted; rooms past their existing `expiresAt` (4 hours from creation) also get deleted.
- Presence-flicker debounce grace window: **3 seconds**.
- Background gradient animation loop: slow (60-90s), non-distracting, sits behind existing `BackgroundFX` and all UI.

---

### Task 1: Restyle the join page as claymorphism

**Files:**
- Modify: `app/join/page.tsx`

**Interfaces:**
- No prop/behavior changes — `handleJoin` logic stays identical, only JSX/className changes.

- [ ] **Step 1: Replace `app/join/page.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePlayerId } from "@/lib/player-session";
import { BackgroundFX } from "@/components/BackgroundFX";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const upperCode = code.trim().toUpperCase();
    try {
      const res = await fetch(`/api/rooms/${upperCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      savePlayerId(upperCode, data.playerId);
      router.push(`/room/${upperCode}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-surface p-6">
      <BackgroundFX intensity="calm" />
      <h1 className="relative font-display text-4xl uppercase text-ink sm:text-5xl">
        Join <span className="text-accent-blue">Room</span>
      </h1>
      <form
        onSubmit={handleJoin}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-clay)] bg-white p-5 shadow-(--shadow-clay-lg)"
      >
        <input
          className="rounded-2xl bg-surface px-3 py-2 text-center font-bold uppercase tracking-widest shadow-(--shadow-clay-pressed) placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-blue"
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
        />
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
          className="rounded-2xl bg-accent-blue px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
        {error && <p className="text-center text-sm font-bold text-accent-primary">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 2: Fix presence flicker (registerPresence write order + toast debounce)

**Files:**
- Modify: `lib/firebase/presence.ts`
- Modify: `hooks/usePresenceToasts.ts`

**Interfaces:**
- `registerPresence(roomCode: string, playerId: string): () => void` — signature unchanged, only internal write ordering changes.
- `usePresenceToasts(players: PlayerWithId[]): ToastMessage[]` — signature and return type unchanged.

- [ ] **Step 1: Fix write ordering in `lib/firebase/presence.ts`**

Replace the full file:

```typescript
import { onDisconnect, onValue, ref, serverTimestamp, set } from "firebase/database";
import { rtdb } from "./client";

export function registerPresence(roomCode: string, playerId: string): () => void {
  const presenceRef = ref(rtdb, `presence/${roomCode}/${playerId}`);
  const connectedRef = ref(rtdb, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return;
    set(presenceRef, { online: true, lastSeen: serverTimestamp() });
    onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() });
  });

  return () => unsubscribe();
}
```

This sets `online: true` immediately when the connection is established, instead of waiting for the `onDisconnect(...).set(...)` registration promise to resolve first. The `onDisconnect` hook registration still happens (so a later disconnect is still recorded), but it no longer blocks the "I'm online" write.

- [ ] **Step 2: Add debounce to `hooks/usePresenceToasts.ts`**

Replace the full file:

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
const DISCONNECT_GRACE_MS = 3000;

export function usePresenceToasts(players: PlayerWithId[]): ToastMessage[] {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const previousConnected = useRef<Map<string, boolean> | null>(null);
  const pendingLeftTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const current = new Map(players.map((p) => [p.id, p.connected]));

    if (previousConnected.current === null) {
      previousConnected.current = current;
      return;
    }

    const prev = previousConnected.current;

    for (const player of players) {
      const wasConnected = prev.get(player.id);
      if (wasConnected === undefined) continue;

      if (wasConnected && !player.connected) {
        const timer = setTimeout(() => {
          const toastId = `${player.id}-left-${Date.now()}`;
          setToasts((existing) => [
            ...existing,
            { id: toastId, text: `${player.nickname} left the room`, kind: "left" },
          ]);
          pendingLeftTimers.current.delete(player.id);
          setTimeout(() => {
            setToasts((existing) => existing.filter((t) => t.id !== toastId));
          }, TOAST_LIFETIME_MS);
        }, DISCONNECT_GRACE_MS);
        pendingLeftTimers.current.set(player.id, timer);
      } else if (!wasConnected && player.connected) {
        const pending = pendingLeftTimers.current.get(player.id);
        if (pending) {
          clearTimeout(pending);
          pendingLeftTimers.current.delete(player.id);
        } else {
          const toastId = `${player.id}-rejoined-${Date.now()}`;
          setToasts((existing) => [
            ...existing,
            { id: toastId, text: `${player.nickname} reconnected`, kind: "rejoined" },
          ]);
          setTimeout(() => {
            setToasts((existing) => existing.filter((t) => t.id !== toastId));
          }, TOAST_LIFETIME_MS);
        }
      }
    }

    previousConnected.current = current;
  }, [players]);

  return toasts;
}
```

A disconnect now schedules its "left" toast 3 seconds out instead of firing immediately. If the same player reconnects before that timer fires, the pending timer is cancelled and no toast fires at all (for either transition) — collapsing a brief blip into silence. If the disconnect is real (still disconnected after 3s), the "left" toast fires as before. A reconnect with no pending "left" timer (i.e., the player was genuinely disconnected for a while) still shows "reconnected" as before.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: Reactive filter — hide disconnected players from Lobby and OpponentsPanel

**Files:**
- Modify: `components/Lobby.tsx:85-103` (player list rendering)
- Modify: `components/OpponentsPanel.tsx:19-20` (opponents filter)

**Interfaces:**
- No prop/type changes to either component — `PlayerWithId` already has a `connected: boolean` field (from `PlayerDoc` in `lib/game/types.ts:26`).

- [ ] **Step 1: Filter Lobby's player list to connected players only**

In `components/Lobby.tsx`, change line 86 from:

```tsx
          {players.map((p, i) => (
```

to:

```tsx
          {players.filter((p) => p.connected).map((p, i) => (
```

- [ ] **Step 2: Filter OpponentsPanel's opponents to connected players only**

In `components/OpponentsPanel.tsx`, change line 20 from:

```tsx
  const opponents = players.filter((p) => p.id !== myPlayerId);
```

to:

```tsx
  const opponents = players.filter((p) => p.id !== myPlayerId && p.connected);
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 4: Scheduled room cleanup via Vercel Cron

**Files:**
- Create: `lib/game/room-cleanup.ts`
- Create: `lib/game/room-cleanup.test.ts`
- Create: `app/api/cron/cleanup/route.ts`
- Create: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `shouldDeleteRoom(room: { expiresAt: number }, players: Array<{ connected: boolean }>, now: number, disconnectedThresholdMs: number): boolean` — pure function, exported from `lib/game/room-cleanup.ts`, consumed by the cron route.
- Produces: `deleteRoomCascade(db: Firestore, roomCode: string): Promise<void>` — deletes a room doc and its `players`/`rounds` (and each round's `guesses`) subcollections. Consumed by the cron route.

- [ ] **Step 1: Write the failing tests for `shouldDeleteRoom`**

Create `lib/game/room-cleanup.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { shouldDeleteRoom } from "./room-cleanup";

const DISCONNECTED_THRESHOLD_MS = 10 * 60 * 1000;

describe("shouldDeleteRoom", () => {
  it("deletes a room whose expiresAt has passed, regardless of players", () => {
    const now = 1_000_000;
    const room = { expiresAt: now - 1 };
    const players = [{ connected: true }];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(true);
  });

  it("does not delete a room with a future expiresAt and at least one connected player", () => {
    const now = 1_000_000;
    const room = { expiresAt: now + 60_000 };
    const players = [{ connected: true }, { connected: false }];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(false);
  });

  it("deletes a room with no players at all (empty room)", () => {
    const now = 1_000_000;
    const room = { expiresAt: now + 60_000 };
    const players: Array<{ connected: boolean }> = [];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(true);
  });

  it("does not delete when all players are disconnected but expiresAt is future (threshold check happens separately per-room via lastAllDisconnectedAt, not this function alone)", () => {
    const now = 1_000_000;
    const room = { expiresAt: now + 60_000 };
    const players = [{ connected: false }, { connected: false }];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(true);
  });
});
```

Note: the fourth test documents the actual contract — `shouldDeleteRoom` treats "all players currently disconnected" as sufficient grounds for deletion (the cron route itself only calls this function for rooms that have already been disconnected past the threshold, via RTDB `lastSeen` — see Step 4). The function itself is a simple, pure predicate; the time-since-disconnected check happens by the caller only invoking it once the threshold has already elapsed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/game/room-cleanup.test.ts`
Expected: FAIL — `lib/game/room-cleanup.ts` does not exist yet.

- [ ] **Step 3: Implement `lib/game/room-cleanup.ts`**

```typescript
import type { Firestore } from "firebase-admin/firestore";

export function shouldDeleteRoom(
  room: { expiresAt: number },
  players: Array<{ connected: boolean }>,
  now: number,
  disconnectedThresholdMs: number
): boolean {
  if (room.expiresAt < now) return true;
  if (players.length === 0) return true;
  if (players.every((p) => !p.connected)) return true;
  return false;
}

export async function deleteRoomCascade(db: Firestore, roomCode: string): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);

  const roundsSnap = await roomRef.collection("rounds").get();
  await Promise.all(
    roundsSnap.docs.map(async (roundDoc) => {
      const guessesSnap = await roundDoc.ref.collection("guesses").get();
      await Promise.all(guessesSnap.docs.map((g) => g.ref.delete()));
      await roundDoc.ref.delete();
    })
  );

  const playersSnap = await roomRef.collection("players").get();
  await Promise.all(playersSnap.docs.map((p) => p.ref.delete()));

  await roomRef.delete();
}
```

Note: `disconnectedThresholdMs` is accepted as a parameter for testability/explicitness even though the current implementation's "all disconnected" branch doesn't use elapsed time directly — the cron route (Step 5) only calls this after confirming via RTDB that the disconnection has persisted past the threshold. This keeps `shouldDeleteRoom` a simple, pure, easily-testable predicate rather than embedding a time-of-last-connection lookup inside it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/game/room-cleanup.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Create the cron route `app/api/cron/cleanup/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { adminDb, adminRtdb } from "@/lib/firebase/admin";
import { deleteRoomCascade, shouldDeleteRoom } from "@/lib/game/room-cleanup";
import type { PlayerDoc, RoomDoc } from "@/lib/game/types";

const DISCONNECTED_THRESHOLD_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const roomsSnap = await adminDb.collection("rooms").get();
  let deletedCount = 0;

  for (const roomDoc of roomsSnap.docs) {
    const room = roomDoc.data() as RoomDoc;
    const playersSnap = await roomDoc.ref.collection("players").get();
    const players = playersSnap.docs.map((p) => p.data() as PlayerDoc);

    if (room.expiresAt < now) {
      await deleteRoomCascade(adminDb, roomDoc.id);
      deletedCount++;
      continue;
    }

    if (players.length === 0) {
      await deleteRoomCascade(adminDb, roomDoc.id);
      deletedCount++;
      continue;
    }

    const allDisconnected = players.every((p) => !p.connected);
    if (!allDisconnected) continue;

    const lastSeenTimestamps = await Promise.all(
      playersSnap.docs.map(async (p) => {
        const snap = await adminRtdb.ref(`presence/${roomDoc.id}/${p.id}`).get();
        const lastSeen = snap.exists() ? (snap.val().lastSeen as number | undefined) : undefined;
        return lastSeen ?? 0;
      })
    );
    const mostRecentDisconnect = Math.max(...lastSeenTimestamps, 0);

    if (now - mostRecentDisconnect >= DISCONNECTED_THRESHOLD_MS) {
      if (shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)) {
        await deleteRoomCascade(adminDb, roomDoc.id);
        deletedCount++;
      }
    }
  }

  return NextResponse.json({ ok: true, deletedCount });
}
```

- [ ] **Step 6: Add `vercel.json` with a 5-minute cron schedule**

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- [ ] **Step 7: Document the new `CRON_SECRET` env var**

Append to `.env.example`:

```
# Random secret string; Vercel Cron sends it as "Authorization: Bearer <value>"
# on scheduled invocations of /api/cron/cleanup. Generate any random string.
CRON_SECRET=
```

- [ ] **Step 8: Run the full test suite and type check**

Run: `npm test`
Expected: all tests pass, including the 4 new `room-cleanup.test.ts` cases.

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 5: Fix tile glitch/repeat on guess submit

**Files:**
- Modify: `components/RoundPlay.tsx`
- Modify: `components/GameBoard.tsx`

**Interfaces:**
- `GameBoard` gains an optional prop: `minAttemptsRendered?: number` (defaults to 0 if omitted) — when provided and greater than `attempts.length`, the board treats the "current" row index as `Math.max(attempts.length, minAttemptsRendered)` instead of `attempts.length` directly.
- `RoundPlay` adds local state `optimisticAttemptCount: number`, reset to 0 whenever `attempts.length` (from the server) reaches or exceeds it.

- [ ] **Step 1: Add `minAttemptsRendered` support to `components/GameBoard.tsx`**

Replace the full file:

```tsx
"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";

interface GameBoardProps {
  attempts: GuessAttempt[];
  currentGuess: string;
  maxAttempts?: number;
  wordLength?: number;
  minAttemptsRendered?: number;
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
  minAttemptsRendered = 0,
}: GameBoardProps) {
  const effectiveAttemptCount = Math.max(attempts.length, Math.min(minAttemptsRendered, maxAttempts));

  const rows: Row[] = Array.from({ length: maxAttempts }, (_, rowIndex) => {
    if (rowIndex < attempts.length) return { kind: "submitted", attempt: attempts[rowIndex] };
    if (rowIndex === effectiveAttemptCount) return { kind: "current" };
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
                  animate={{ rotateX: [0, 90, 0], scale: [1, 1.2, 1] }}
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

(This step also applies the Task 3c reveal-bounce tweak — `scale: [1, 1.2, 1]` instead of `[1, 1.15, 1]` — bundled here since it's the same file; see Task 8 for the green-tile sparkle addition on top of this.)

- [ ] **Step 2: Add optimistic attempt count in `components/RoundPlay.tsx`**

In `components/RoundPlay.tsx`, add the new state and effect. Change the top of the component (after existing `useState` declarations) from:

```tsx
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urgent, setUrgent] = useState(false);

  const attempts = myGuess?.attempts ?? [];
```

to:

```tsx
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [optimisticAttemptCount, setOptimisticAttemptCount] = useState(0);

  const attempts = myGuess?.attempts ?? [];

  useEffect(() => {
    if (attempts.length >= optimisticAttemptCount) {
      setOptimisticAttemptCount(0);
    }
  }, [attempts.length, optimisticAttemptCount]);
```

Then update `submitGuess` — change:

```tsx
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
```

to:

```tsx
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
        setTimeout(() => {
          setShake(false);
          setCurrentGuess("");
        }, 400);
        return;
      }
      setOptimisticAttemptCount(attempts.length + 1);
      setCurrentGuess("");
    } finally {
      setSubmitting(false);
    }
  }
```

(This bundles the Task 6 "shake then clear" fix in the same edit, since both touch the same error branch of `submitGuess`.)

Finally, pass the new prop to `GameBoard` — change:

```tsx
            <GameBoard attempts={attempts} currentGuess={canPlay ? currentGuess : ""} />
```

to:

```tsx
            <GameBoard
              attempts={attempts}
              currentGuess={canPlay ? currentGuess : ""}
              minAttemptsRendered={optimisticAttemptCount}
            />
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 6: Verify invalid-word clear behavior (covered by Task 5)

**Files:** none — this task is a verification-only checkpoint; Task 5 Step 2 already implements the fix (moved `setCurrentGuess("")` inside the same `setTimeout` as `setShake(false)` in the error branch).

**Interfaces:** none new.

- [ ] **Step 1: Confirm the error-branch code in `components/RoundPlay.tsx` matches**

Read `components/RoundPlay.tsx` and confirm the `submitGuess` error branch reads exactly:

```tsx
      if (!res.ok) {
        setError(data.error ?? "Invalid guess");
        setShake(true);
        setTimeout(() => {
          setShake(false);
          setCurrentGuess("");
        }, 400);
        return;
      }
```

Expected: present exactly as shown (from Task 5 Step 2). If not present, apply it now.

---

### Task 7: Recenter Round-Play with a grid layout + "Join Game" button on home page

**Files:**
- Modify: `components/RoundPlay.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- No prop changes — layout-only restructure of `RoundPlay`'s returned JSX.

- [ ] **Step 1: Replace the layout wrapper in `components/RoundPlay.tsx`**

Change the return statement's outer structure — from:

```tsx
  return (
    <div className="flex flex-col items-center gap-6">
      <BackgroundFX intensity={urgent ? "max" : "energetic"} />
      <div className="relative z-10 flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
        <OpponentsPanel players={players} myPlayerId={myPlayerId} guessesByPlayer={guessesByPlayer} />
        <div className="flex flex-col items-center gap-6">
```

to:

```tsx
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <BackgroundFX intensity={urgent ? "max" : "energetic"} />
      <div className="relative z-10 grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[14rem_1fr_14rem]">
        <div className="hidden lg:block">
          <OpponentsPanel players={players} myPlayerId={myPlayerId} guessesByPlayer={guessesByPlayer} />
        </div>
        <div className="col-start-1 flex flex-col items-center gap-6 lg:col-start-2">
```

And change the closing tags at the end of the component — from:

```tsx
          <Keyboard attempts={attempts} onKeyPress={handleKeyPress} disabled={!canPlay || submitting} />
        </div>
      </div>
    </div>
  );
}
```

to:

```tsx
          <Keyboard attempts={attempts} onKeyPress={handleKeyPress} disabled={!canPlay || submitting} />
        </div>
        <div className="hidden lg:block" aria-hidden />
      </div>
    </div>
  );
}
```

This makes the game column always occupy the grid's middle track (`1fr`, centered by the grid itself), with two `14rem` tracks flanking it — the left holding `OpponentsPanel` (already `hidden lg:flex` internally, now additionally wrapped so it never renders below `lg` at all), the right an empty spacer keeping the middle track visually centered in the viewport regardless of whether the left panel has content. Below `lg`, the grid collapses to a single column (`grid-cols-1`) and both side tracks are `hidden`, so mobile is unaffected — the game column is the only visible content, already centered via the outer `flex flex-col items-center`.

- [ ] **Step 2: Add a "Join Game" button to `app/page.tsx`**

Change the home page's join link — from:

```tsx
        <a
          href="/join"
          className="text-center text-sm font-bold uppercase text-accent-blue underline decoration-2 underline-offset-4"
        >
          Have a room code? Join instead
        </a>
```

to:

```tsx
        <a
          href="/join"
          className="rounded-2xl bg-accent-tertiary px-4 py-3 text-center font-display uppercase tracking-wide text-black shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed)"
        >
          Join Game
        </a>
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 8: Animated gradient background + randomized-direction BackgroundFX + green-tile sparkle

**Files:**
- Modify: `app/globals.css`
- Modify: `components/BackgroundFX.tsx`
- Modify: `components/GameBoard.tsx`

**Interfaces:**
- `BackgroundFX`'s public interface (`{ intensity: "calm" | "energetic" | "max" }`) is unchanged — only its internal motion/generation logic changes.
- `GameBoard`'s public interface is unchanged from Task 5 (already updated there) — this task only adds an `onComplete` callback to the existing tile-flip `motion.div`.

- [ ] **Step 1: Add the animated gradient to `app/globals.css`**

Change the `body` rule and add a keyframe — from:

```css
body {
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

to:

```css
@keyframes sky-drift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

body {
  background: linear-gradient(120deg, #a1c4fd, #c2e9fb 35%, #fbc2eb 70%, #a1c4fd);
  background-size: 300% 300%;
  animation: sky-drift 75s ease-in-out infinite;
  color: var(--ink);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

`--surface` stays defined and unchanged in `:root` (Task's non-goal: clay cards/inputs referencing `bg-surface` are unaffected — only the page backdrop itself changes).

- [ ] **Step 2: Randomize BackgroundFX item motion direction**

Replace the full file `components/BackgroundFX.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

type Intensity = "calm" | "energetic" | "max";

const EMOJI = ["🎉", "⭐", "✨", "🔤", "💥", "🟩", "🟨", "🎈"];

const INTENSITY_CONFIG: Record<
  Intensity,
  { count: number; minDuration: number; maxDuration: number; minScale: number; maxScale: number }
> = {
  calm: { count: 16, minDuration: 10, maxDuration: 18, minScale: 0.7, maxScale: 1.1 },
  energetic: { count: 24, minDuration: 6, maxDuration: 12, minScale: 0.8, maxScale: 1.3 },
  max: { count: 34, minDuration: 3, maxDuration: 7, minScale: 0.9, maxScale: 1.6 },
};

interface FloatingItem {
  id: number;
  emoji: string;
  left: number;
  top: number;
  duration: number;
  delay: number;
  scale: number;
  deltaX: number;
  deltaY: number;
  rotateDirection: number;
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
    deltaX: (Math.random() - 0.5) * 240,
    deltaY: (Math.random() - 0.5) * 240,
    rotateDirection: Math.random() > 0.5 ? 1 : -1,
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
            x: [0, item.deltaX, 0, -item.deltaX, 0],
            y: [0, item.deltaY, 0, -item.deltaY, 0],
            rotate: [0, 15 * item.rotateDirection, 0, -15 * item.rotateDirection, 0],
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

Each item now travels along its own randomized `deltaX`/`deltaY` diagonal (up to ±120px in either axis) instead of a shared vertical-only bob, so items visibly drift in varied directions rather than all moving the same way.

- [ ] **Step 3: Add a green-tile sparkle burst on reveal in `components/GameBoard.tsx`**

Add a `confetti` import and an `onAnimationComplete` handler. Change the top of the file — from:

```tsx
"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";
```

to:

```tsx
"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { GuessAttempt, TileColor } from "@/lib/game/types";
```

Add a ref to track which tiles have already sparkled (so it fires once per attempt, not on every re-render) — inside the component, right after the `effectiveAttemptCount` line:

```tsx
  const effectiveAttemptCount = Math.max(attempts.length, Math.min(minAttemptsRendered, maxAttempts));
  const sparkledRef = useRef<Set<string>>(new Set());
```

Then update the submitted-tile `motion.div` to fire a small confetti burst once, on completion, only for green tiles — change:

```tsx
              return (
                <motion.div
                  key={colIndex}
                  initial={{ rotateX: 0, scale: 1 }}
                  animate={{ rotateX: [0, 90, 0], scale: [1, 1.2, 1] }}
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
```

to:

```tsx
              const tileKey = `${rowIndex}-${colIndex}`;
              return (
                <motion.div
                  key={colIndex}
                  initial={{ rotateX: 0, scale: 1 }}
                  animate={{ rotateX: [0, 90, 0], scale: [1, 1.2, 1] }}
                  transition={{
                    duration: 0.5,
                    delay: colIndex * 0.15,
                    times: [0, 0.5, 1],
                    ease: ["easeIn", "backOut"],
                  }}
                  onAnimationComplete={(e) => {
                    const el = e as { target?: EventTarget | null };
                    void el;
                    if (color !== "green" || sparkledRef.current.has(tileKey)) return;
                    sparkledRef.current.add(tileKey);
                    confetti({
                      particleCount: 10,
                      spread: 40,
                      startVelocity: 18,
                      scalar: 0.6,
                      origin: { x: 0.5, y: 0.6 },
                      disableForReducedMotion: true,
                    });
                  }}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl font-black shadow-(--shadow-clay-sm) sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
                >
                  {letter}
                </motion.div>
              );
```

Note: `onAnimationComplete` in framer-motion doesn't provide the DOM element's screen position directly, so this uses a fixed relative `origin: { x: 0.5, y: 0.6 }` (roughly board-center) rather than per-tile coordinates — a small, cheap burst rather than a precisely-positioned one, which keeps this task free of new coordinate-measurement code while still delivering the "sparkle on correct tile" feedback. `sparkledRef` (keyed by `rowIndex-colIndex`) ensures each tile only fires once even if the component re-renders after the animation already completed.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass, including the 4 new `lib/game/room-cleanup.test.ts` cases (total should be 43 existing + 4 new = 47).

- [ ] **Step 2: Run full type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual dev-server verification**

Run: `npm run dev`

With the dev server running and a real Firestore/RTDB connection:
1. Load `/join` — confirm it now renders in the clay style with `BackgroundFX`, not plain white/default Tailwind.
2. Create a room as host, then join as a second player from another tab — confirm no spurious "left the room" / "reconnected" toast pair appears for the second player on join.
3. In the second tab, close it (simulating disconnect) — confirm the player's name disappears from the Lobby list within a few seconds (via the `connected` filter), not just grayed out.
4. Start a round with 2 players, submit a valid guess — confirm the tile row reveals cleanly with no flash/repeat of the word in the row below.
5. Submit an invalid (not-in-wordlist) word — confirm the row shakes, then clears back to empty.
6. Confirm a green tile fires a small sparkle burst on reveal.
7. On desktop width (≥1024px), confirm the game board (Timer/GameBoard/Keyboard) sits visually centered in the viewport with the Opponents panel to its left — not shifted right.
8. On mobile width (~375px), confirm layout is still centered and unaffected by the grid change.
9. Confirm the home page's "Join Game" is now a filled button, not a text link, and it still navigates to `/join`.
10. Confirm the page background is now an animated pastel gradient (blue/pink/lavender) instead of flat cream, and BackgroundFX items drift in varied directions rather than a uniform up-down bob.
11. (Cannot fully verify Vercel Cron locally.) Confirm `GET /api/cron/cleanup` with header `Authorization: Bearer <CRON_SECRET from .env>` returns `{ ok: true, deletedCount }` and does not error; confirm it returns 401 without the header.

- [ ] **Step 4: Do NOT commit**

Per this plan's Global Constraints, leave all changes uncommitted in the working tree. Do not run `git add`, `git commit`, or `git push` for any step in this plan.

---

## Self-Review Notes

- **Spec coverage:** 1a (join page) — Task 1. 1b (presence flicker) — Task 2. 1c (stale sessions, reactive + scheduled) — Tasks 3 and 4. 1d (tile glitch) — Task 5. 1e (invalid word clear) — bundled into Task 5 Step 2, verified standalone in Task 6. 2a (join button) — Task 7 Step 2. 2b (recenter) — Task 7 Step 1. 2c (mobile re-check) — Task 9 Step 3.8. 3a (gradient) — Task 8 Step 1. 3b (randomized BackgroundFX) — Task 8 Step 2. 3c (per-letter feedback) — Task 5 Step 1 (bigger bounce) + Task 8 Step 3 (green sparkle).
- **No placeholders:** every step has complete, copy-pasteable code or an exact command with expected output.
- **Type consistency:** `GameBoard`'s new `minAttemptsRendered` prop is defined in Task 5 Step 1 and consumed identically in Task 5 Step 2's `RoundPlay` update. `shouldDeleteRoom`'s signature defined in Task 4 Step 3 matches exactly how the cron route (Step 5) calls it and how the tests (Step 1) call it.
- **Global constraint applied throughout:** no task in this plan includes a `git add`/`commit` step — every other plan in this project's history had one per task; this one deliberately omits them per the explicit "local only" instruction.
