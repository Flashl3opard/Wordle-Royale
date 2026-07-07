# Claymorphism Redesign + Live Opponents Panel + Simplified Podium — Design

## Problem

The app currently uses a neo-brutalist visual language (thick black borders, hard offset drop-shadows, flat color blocks). The request is to move to a **claymorphism** look instead — soft rounded shapes, puffy soft-blur shadows, subtle inner highlights, gentle press/tilt depth on interaction — while keeping the existing color palette. Alongside the visual shift, three functional gaps:

1. There's no visibility into opponents' progress during a round on desktop.
2. The Podium (final results) screen uses a bar-chart + separate list that doesn't emphasize speed/efficiency.
3. General mobile responsiveness needs auditing as part of restyling every component.

## Part 1 — Claymorphism visual language

Applies globally, replacing the brutalist primitives used throughout `app/globals.css` and every component's className strings.

### Design tokens (`app/globals.css`)

Replace `--shadow-brutal` / `--shadow-brutal-lg` (hard offset black shadows) with soft clay shadow tokens:

```css
--shadow-clay: 8px 8px 16px rgba(0, 0, 0, 0.12), -4px -4px 12px rgba(255, 255, 255, 0.7);
--shadow-clay-inset: inset 2px 2px 4px rgba(255, 255, 255, 0.6), inset -2px -2px 6px rgba(0, 0, 0, 0.08);
--shadow-clay-pressed: inset 4px 4px 8px rgba(0, 0, 0, 0.15), inset -2px -2px 6px rgba(255, 255, 255, 0.5);
--radius-clay: 1.5rem;
```

Existing color variables (`--accent-primary`, `--tile-correct`, etc.) are unchanged — same palette, new material.

### Primitive restyle rules (applied everywhere `border-4 border-black` + `shadow-(--shadow-brutal*)` currently appear)

- Remove `border-4 border-black` — clay shapes have no hard border. Where a border reads as necessary for contrast (e.g. input fields on white), replace with a thin `border border-black/10` at most.
- Add `rounded-[var(--radius-clay)]` (or `rounded-2xl`/`rounded-3xl` via Tailwind scale, whichever reads closer to the token) to every card, button, tile, and input — corners no longer sharp.
- Replace `shadow-(--shadow-brutal)` / `shadow-(--shadow-brutal-lg)` with `shadow-(--shadow-clay)`.
- Buttons: add a pressed-state effect on `whileTap` (framer-motion `whileTap={{ scale: 0.96 }}` already exists in several places — pair it with a class swap or a `box-shadow` transition to `--shadow-clay-pressed` on `:active` for the tactile "push into clay" feel).
- Game tiles (`GameBoard.tsx`) and keyboard keys (`Keyboard.tsx`) get the same rounded + soft-shadow treatment; the existing flip/press animations are kept as-is (motion logic untouched, only the visual shell changes).
- `BackgroundFX` decorative shapes are unaffected (they're already soft/rounded emoji-based, no border/shadow to migrate).

### Scope

Every component currently referencing `border-4 border-black` and/or `shadow-(--shadow-brutal...)`: `app/page.tsx`, `components/Lobby.tsx`, `components/JoinInline.tsx`, `components/GameBoard.tsx`, `components/Keyboard.tsx`, `components/Timer.tsx`, `components/RoundPlay.tsx`, `components/Podium.tsx`, `components/Toast.tsx`, `components/Leaderboard.tsx`. This is a mechanical, visual-only pass — no logic changes in any of these files from this part alone.

## Part 2 — Live opponents panel (desktop only)

### Data

`hooks/useRoundGuesses.ts` already subscribes to all players' `GuessDoc`s in a round via Firestore `onSnapshot` on the `guesses` subcollection (`rooms/{code}/rounds/{n}/guesses`), gated by an `enabled` boolean. Firestore rules already allow open reads on this path (`firestore.rules:17-20`), so no rules change is needed.

Currently `app/room/[code]/page.tsx:35-39` only enables this hook when `room?.status === "finished"`. Change the gate to `room?.status === "in_round" || room?.status === "finished"` so the same hook now also feeds live data during play.

### Component: `components/OpponentsPanel.tsx` (new)

```
interface OpponentsPanelProps {
  players: PlayerWithId[];
  myPlayerId: string;
  guessesByPlayer: Record<string, GuessDoc>;
}
```

- Renders a vertical list, one row per player excluding `myPlayerId`.
- For each player, reads `guessesByPlayer[player.id]?.attempts` and takes the **last** attempt (most recent guess). If no attempts yet, shows 5 empty/neutral slots.
- Renders 5 small square/dot indicators colored per `TileColor` from that last attempt's `tiles` array (green/yellow/gray), matching the existing `TILE_COLORS` mapping already defined in `GameBoard.tsx` (reuse the same color tokens, not the letters — this never reveals the guessed word, only the color counts, per design intent of not spoiling).
- Shows player nickname and, if `guessesByPlayer[player.id]?.solved`, a small "solved" badge (reusing the existing solved-state color, `tile-correct`).
- Styled with the same clay primitives as Part 1 (rounded card, soft shadow).

### Integration (`components/RoundPlay.tsx`)

- Add a new prop: `opponentsPanel?: React.ReactNode` is unnecessary — instead, `RoundPlay` receives `players: PlayerWithId[]` and `guessesByPlayer: Record<string, GuessDoc>` as new props (both already available in `app/room/[code]/page.tsx` from existing hooks) and renders `<OpponentsPanel>` internally.
- Layout: wrap the existing centered column (Timer/GameBoard/Keyboard) and the new `OpponentsPanel` in a flex row at desktop breakpoints: `flex flex-col lg:flex-row lg:items-start lg:justify-center gap-8`, with `OpponentsPanel` positioned first (left side) and given `hidden lg:flex` so it does not render at all in the DOM's visible layout on mobile (not just visually hidden — `hidden` removes it from layout entirely, which also avoids any mobile overflow risk from this new element).

### Files touched
- Create: `components/OpponentsPanel.tsx`
- Modify: `components/RoundPlay.tsx` (new props, layout wrapper)
- Modify: `app/room/[code]/page.tsx` (widen `useRoundGuesses` enabled condition, pass `players`/`guessesByPlayer` into `RoundPlay`)

## Part 3 — Simplified Podium score card

### Data derivation

For each player in `guessesByPlayer`:
- `solved: boolean` — already on `GuessDoc`.
- `attempts: number` — `guessesByPlayer[player.id]?.attempts.length ?? 0`.
- `timeMs: number | null` — if solved, `lastAttempt.submittedAt - round.startedAt` (both fields already exist: `GuessAttempt.submittedAt`, `RoundDoc.startedAt`). `Podium` needs `round.startedAt` as a new prop (currently only receives `secretWord` from the round doc in `app/room/[code]/page.tsx:122`).
- Sort order: solved players first (fastest `timeMs` ascending as tiebreaker within equal scores — score remains primary sort per existing `totalScore` logic; time is a displayed stat and tiebreaker highlight, not a scoring change), then unsolved players.

### Component changes (`components/Podium.tsx`)

- Remove the bar-chart `PodiumSpot` 1st/2nd/3rd visual block entirely.
- Replace the plain `<ul>` score list with a single ranked card list (clay-styled rows), each row showing: place number, nickname, attempts used (e.g. "3 tries"), time taken (e.g. "12.4s") or "Out of guesses" if unsolved, and score.
- The single fastest solver (lowest `timeMs` among solved players) gets a small highlight badge (e.g. "⚡ Fastest solve") — purely visual, does not change scoring/ranking logic beyond the existing score-based sort already in place.
- Confetti and `BackgroundFX intensity="max"` behavior (existing, already correct) is unchanged.

### Files touched
- Modify: `components/Podium.tsx` (remove `PodiumSpot`, add ranked card list with time/attempts, add `roundStartedAt: number` prop)
- Modify: `app/room/[code]/page.tsx` (pass `round.startedAt` into `Podium`)

## Part 4 — Mobile responsiveness pass

Not a separate component — applied while touching each file in Parts 1–3:
- Confirm `OpponentsPanel` is `hidden` (not just shrunk) below `lg`.
- Re-check `GameBoard`/`Keyboard` tile sizing at narrow widths (`sm:` breakpoints already exist; verify clay corner-radius/shadow additions don't push total width past small viewports — test at 360px width, a common small-phone size).
- Re-check Lobby's duration input + mode toggle buttons don't overflow at narrow widths with the new rounded/padded clay style (rounded corners can visually increase perceived size; verify no horizontal scroll appears).
- Podium's new ranked card list uses `flex-wrap`/truncation for long nicknames so time/attempts/score don't get pushed off-screen on narrow viewports.

## Non-goals
- No WebGL/Three.js — this is CSS-only "3D" (soft shadow depth), confirmed with the user.
- No change to scoring rules, round lifecycle, or Firestore schema — all data needed already exists (`submittedAt`, `startedAt`, `solved`, `attempts`).
- No security rules changes — reads are already open.
- Palette colors unchanged — same accent colors, new material/shape treatment only.

## Testing
- `lib/game/scoring.test.ts` and other existing unit tests are untouched (no scoring logic changes).
- Manual verification (per this project's `verify` skill): confirm `OpponentsPanel` shows live, updates as opponents guess, is completely absent from mobile DOM (not just hidden via CSS overflow), doesn't reveal opponents' actual letters. Confirm Podium shows correct attempts/time per player and highlights the fastest solver. Confirm clay visual style renders consistently across Lobby/RoundPlay/Podium/JoinInline on both desktop and a small mobile viewport (360–390px wide) with no horizontal overflow.
