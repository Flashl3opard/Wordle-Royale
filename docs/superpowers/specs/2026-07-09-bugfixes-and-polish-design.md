# Bug Fixes, Session Cleanup, and Visual Polish — Design

**Local-only work:** per explicit instruction, no `git add`/`commit`/`push` for this round of changes — everything stays uncommitted in the working tree until the user pushes it themselves.

## Problem

A batch of user-reported issues spans real bugs (presence flicker, stale sessions, tile glitch, off-center layout, unstyled join page) and requested polish (background theme, more animation, join button, invalid-word clear behavior).

## Part 1 — Bug Fixes

### 1a. Join page unstyled

`app/join/page.tsx` was never migrated in the claymorphism redesign — it still uses raw Tailwind defaults (`border-gray-400`, `bg-green-600`, plain `<h1>`). Fix: restyle to match the rest of the app — `BackgroundFX` (calm intensity), clay card container, `font-display` heading, same input/button treatment as `JoinInline.tsx`.

### 1b. Disconnect/reconnect flash on join

**Root cause:** `lib/firebase/presence.ts`'s `registerPresence()` calls `onDisconnect(presenceRef).set(...)` and only calls `set(presenceRef, {online: true})` inside that promise's `.then()`. Between the client connecting and that chain resolving, `usePresenceSync`'s 5-second poll (`hooks/usePresenceSync.ts` → `/api/rooms/[code]/presence`) can read the RTDB presence node as absent or stale, causing the server to briefly write `connected: false` to the player's Firestore doc, which `usePresenceToasts` sees as a `true→false→true` flip and fires both "left" and "rejoined" toasts.

**Fix:**
- In `registerPresence`, set `online: true` immediately (fire-and-forget) alongside registering the `onDisconnect` hook, rather than sequencing the `set` after the `onDisconnect` promise resolves — removes the window where presence is unset for a genuinely-connected client.
- In `hooks/usePresenceToasts.ts`, add a short debounce: a disconnect that flips back to connected within 3 seconds does not fire either toast (only flips that persist past the grace window are "real"). Implementation: instead of firing the "left" toast immediately on `wasConnected && !connected`, schedule it with a 3s `setTimeout`; if a matching "reconnected" transition for the same player arrives before that timeout fires, cancel it and suppress both.

### 1c. Stale sessions/rooms never destroyed

**Root cause:** `RoomDoc.expiresAt` (set at creation, `ROOM_TTL_MS = 4 hours`) is never read or acted on anywhere in the codebase. Players who close their tab without calling `/leave` remain in the room's player list indefinitely (Firestore doc is never deleted), and disconnected players still render in the Lobby/OpponentsPanel lists since nothing filters on `connected`.

**Fix, two parts:**
- **Reactive removal (client):** `components/Lobby.tsx`'s player list and `components/OpponentsPanel.tsx`'s opponent list both filter to `players.filter(p => p.connected)` before rendering, so a disconnected player disappears from the visible list as soon as their `connected` field flips to `false` (already live via the existing `useRoomSubscription` `onSnapshot`) — no new data flow needed, just a render-time filter.
- **Scheduled cleanup (server):** new Vercel Cron job. `vercel.json` (new file) defines a cron schedule calling a new route `app/api/cron/cleanup/route.ts` every 5 minutes. That route:
  - Queries all rooms where `expiresAt < now` → deletes them (room doc + `players`/`rounds`/`guesses` subcollections).
  - Queries all rooms whose players are ALL `connected: false` — for each, checks each player's RTDB presence `lastSeen` timestamp; if every player has been disconnected for 10+ minutes, deletes the room the same way.
  - The route is protected by checking a `CRON_SECRET` env var against Vercel's `Authorization: Bearer` header on cron-triggered requests (Vercel's documented pattern), so it can't be triggered by arbitrary public requests.

### 1d. Tile glitch/repeat after submitting a guess

**Root cause:** `components/RoundPlay.tsx`'s `submitGuess` calls `setCurrentGuess("")` immediately on a successful response, but `attempts` (passed into `GameBoard`) comes from `myGuess` — a prop sourced from a separate Firestore `onSnapshot` subscription (`useMyGuessSubscription`) that hasn't necessarily received the new attempt yet. For one or more render frames, `GameBoard` still computes the "current" row as `rowIndex === attempts.length` using the OLD (pre-submit) `attempts.length`, while `currentGuess` is already `""` — combined with each tile's `key={colIndex}` reuse across row-role transitions, framer-motion can carry over/replay the outgoing animation state into what's now a differently-classified row, producing the observed flash/repeat in the row below.

**Fix:** track an `optimisticAttemptCount` local state in `RoundPlay`, incremented synchronously the instant `submitGuess` gets a successful (2xx) response — before `setCurrentGuess("")`. Pass `Math.max(attempts.length, optimisticAttemptCount)` as the effective count into `GameBoard` (as a new optional `minAttempts` prop, or by pre-padding a synthetic last row) so the "current" row pointer advances in the same tick the input clears, eliminating the stale-index window. Reset `optimisticAttemptCount` back to 0 whenever `attempts.length` from Firestore catches up past it (via a `useEffect` keyed on `attempts.length`).

### 1e. Invalid word: shake then clear

**Current:** `submitGuess`'s error branch sets `shake: true` for 400ms but never clears `currentGuess` — letters remain after the shake.
**Fix:** in the same error branch (after the "Not a valid word" 422 response specifically — not other errors like rate-limiting), also call `setCurrentGuess("")` after the shake animation completes (same 400ms timeout that already resets `shake`), so the row empties out for a fresh attempt.

## Part 2 — UX Changes

### 2a. "Join Game" button instead of link

`app/page.tsx`: replace the `<a href="/join">Have a room code? Join instead</a>` text link with a clay-styled secondary button (e.g., outlined/lighter variant of the existing button style) reading "Join Game", still navigating to `/join`.

### 2b. Recenter the Round-Play screen

**Root cause:** `components/RoundPlay.tsx`'s wrapper (`flex ... lg:flex-row lg:items-start lg:justify-center`) treats `OpponentsPanel` and the game column as two flex siblings centered as a *group* — since `OpponentsPanel` has a fixed `w-56` and the game column doesn't, `justify-center` centers their combined bounding box, not the game column alone, visually shifting the board right of true viewport-center.

**Fix:** restructure so the game column (Timer/GameBoard/message/Keyboard) is wrapped in its own full-width centered container (`w-full flex justify-center`), and `OpponentsPanel` is positioned independently — at `lg`+ widths, absolutely positioned (`lg:absolute lg:left-[calc(50%-theme(spacing.96))] ...` or a fixed-width flex sibling *outside* the centering context, e.g. a CSS grid with the center column always occupying the true-center track regardless of the side panel's presence) so its presence never shifts the board's center point. Simplest concrete approach: three-column CSS grid (`grid-cols-[14rem_1fr_14rem]` at `lg:`, empty spacer columns at smaller widths) with the game column always in the middle track and `OpponentsPanel` in the left track — grids don't `justify-center` the group, each track is independently sized, so the middle track's center coincides with the viewport's actual center when the two outer tracks are equal width (14rem placeholder / actual panel).

### 2c. Mobile responsiveness re-check on Round-Play

Re-verify at 360-390px viewport width after the recenter fix (grid collapses to a single centered column below `lg`, `OpponentsPanel` stays `hidden` below `lg` per existing behavior) — no new mobile-specific work beyond confirming the grid fix doesn't regress what was already verified in the claymorphism pass.

## Part 3 — Visual Polish

### 3a. Background theme: Soft Gradient Sky

Replace the flat `--surface: #fdf6e9` background with an animated pastel gradient. Implementation: a `body`-level (or a new fixed full-viewport `div` below `BackgroundFX`) `background: linear-gradient(...)` across blue → pink → lavender stops, animated via a CSS `@keyframes` that shifts `background-position` (using a gradient sized larger than 100% and animating its position) or interpolates `background` via a slow hue-rotation filter — slow enough (60-90s loop) to read as ambient, not distracting, since text/tiles/buttons render on top. `--surface` CSS variable itself stays defined (still used by clay `bg-surface` utility classes for cards/inputs) — only the page/body backdrop changes, not every element that currently references `--surface`.

### 3b. More floating decorations moving in random directions

`components/BackgroundFX.tsx`: increase `INTENSITY_CONFIG` item counts, and replace the current shared vertical-bob `animate={{ y: [0, -24, 0, 24, 0], rotate: [...] }}` with per-item randomized travel: each `FloatingItem` gets its own randomized `deltaX`/`deltaY` (e.g., ±80-160px) computed at generation time (already using `Math.random()` per-item in `generateItems`), and the `animate` prop becomes `{ x: [0, item.deltaX, 0], y: [0, item.deltaY, 0], rotate: [...] }` — each item drifts along its own independent diagonal path rather than all items sharing the same up-down motion, reading as more "random direction" movement.

### 3c. Bigger per-letter guess feedback

`components/GameBoard.tsx`: on the submitted-tile reveal animation, increase the bounce overshoot (`scale` peak) slightly and keep the existing `delay: colIndex * 0.15` stagger; add a small framer-motion `AnimatePresence`-free inline burst (e.g., a brief scaled ping pseudo-element or a tiny `canvas-confetti` burst positioned at that tile's screen coordinates) specifically when `color === "green"`, firing once when that tile's reveal animation completes (not on every render) — implemented via the `transition`'s `onComplete` callback already supported by framer-motion, gated by a `useRef` to fire only once per attempt.

## Non-goals
- No change to scoring, round lifecycle, or word-validation logic beyond the invalid-word clear-on-shake UX.
- No change to Firestore security rules.
- No dark-mode work.
- No new npm dependencies beyond what's already installed (framer-motion, canvas-confetti) — the cron route uses only `adminDb`/`adminRtdb`, already available.
- This round of work is **local-only**: implementation proceeds without any git commits per explicit instruction; the user will commit/push manually when ready.

## Testing
- `lib/game/validation.test.ts` unaffected (no schema changes).
- New: a focused test for the cron cleanup route's deletion-eligibility logic (pure function extracted from the route, e.g. `shouldDeleteRoom(room, players): boolean`) covering expired-by-TTL and all-disconnected-past-threshold cases.
- Manual verification (per this project's `verify` skill): join a room as a second player and confirm no spurious left/rejoined toast pair; disconnect a player (close tab) and confirm their name disappears from the Lobby/OpponentsPanel list; submit a guess and confirm no flash/repeat in the row below; submit an invalid word and confirm shake-then-clear; confirm the Round-Play game board is visually centered in the viewport with the Opponents panel visible at desktop width; confirm background gradient animates smoothly and BackgroundFX items drift in varied directions; confirm join page renders in the clay style; confirm "Join Game" button appears in place of the old link.
