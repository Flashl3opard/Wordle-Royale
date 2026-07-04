# Timer Fix + Jolly Light-Mode UI — Design

## Problem

1. **Timer bug:** In timed mode, the round always ends after 30 seconds no matter what duration the host sets in the lobby. The current implementation persists `roundDurationMs` via a separate `PATCH /api/rooms/[code]/settings` call, fired on the number input's `onBlur`. `POST /api/rooms/[code]/start` then reads `room.roundDurationMs` from Firestore independently. If the PATCH hasn't resolved (or never fired) before Start is clicked, the round is created using the stale default (30000ms set at room creation). There is no ordering guarantee between the two requests.

2. **UI feel:** The current neo-brutalist look is clean but minimal/static. The request is for a "jolly," energetic game feel — animations, floating decorative assets, and juiced-up micro-interactions — while staying in light mode and keeping the existing brutalist visual language (thick black borders, hard drop shadows, bold color blocks).

## Part 1 — Timer Fix

### Root cause fix

`POST /api/rooms/[code]/start` will accept `mode` and `roundDurationMs` directly in its request body and write them to the room document as part of starting the round, instead of trusting whatever is already persisted in Firestore. This removes the race entirely — Start no longer depends on a prior PATCH having landed.

- `startRoomSchema` (lib/game/validation.ts) gains:
  - `mode: z.enum(["timed", "infinite"])`
  - `roundDurationMs: z.number().int().min(30000).max(600000).optional()` (required when `mode === "timed"`, same `.refine` pattern already used in `roomSettingsSchema`)
- `start/route.ts` writes `{ mode, roundDurationMs, status: "in_round" }` to the room doc in the same update that flips status, using the values from the request body (falling back to existing room values only if the client didn't send them — keeps the endpoint backward-safe).
- The existing `PATCH /settings` endpoint is unchanged and still used for live-syncing the host's in-progress choice to other players' lobby screens before Start is clicked (nice-to-have visibility, not load-bearing for correctness).
- `roomSettingsSchema`'s `roundDurationMs` bound changes from `.min(10000).max(120000)` to `.min(30000).max(600000)` to match the new minutes range.

### Minutes-based input

- Lobby's duration control changes from a seconds `<input type="number">` (10–120) to a **minutes** input accepting decimals (step 0.5), range **0.5–10 minutes** (30s–600s).
- Internally still converts to `roundDurationMs = Math.round(minutes * 60000)` before sending over the wire; no new units enter Firestore or the round-lifecycle code.
- `startGame()` in Lobby.tsx sends `{ playerId, mode, roundDurationMs }` (roundDurationMs only when mode is "timed") directly in the Start request, sourced from current component state — guaranteeing the value the host is looking at is the value used.

### Files touched
- `lib/game/validation.ts` — update `startRoomSchema`, widen `roomSettingsSchema` bounds
- `app/api/rooms/[code]/start/route.ts` — accept & persist mode/duration atomically with round creation
- `components/Lobby.tsx` — minutes input, send mode+duration with Start request

## Part 2 — Jolly Light-Mode UI

Keep the current neo-brutalist palette (cream surface, red/yellow/teal/pink/blue accents, thick black borders, hard offset shadows) and existing components; amplify with motion and decoration rather than restyling from scratch.

### New: `BackgroundFX` component

- A fixed, full-viewport, pointer-events-none layer rendering a scattered field of floating emoji/shapes (🎉⭐✨🔤💥🟩🟨), each independently animated via framer-motion: slow drift (translate loop), gentle rotation, subtle scale pulse, randomized delay/duration per item so they don't move in lockstep.
- Pure CSS/SVG/emoji — no image asset files, keeps bundle light.
- Accepts an `intensity: "calm" | "energetic" | "max"` prop controlling item count and animation speed/amplitude.
- Mounted per-screen (not globally in layout.tsx) so each screen can pick its own intensity:
  - Lobby → `calm`
  - RoundPlay → `energetic` (and reacts to low-time urgency, see below)
  - Podium → `max`

### Escalating energy per screen

- **Lobby:** low-density calm background bob; existing card layout kept, cards get a slight random rotation (±1–2deg) per card for a hand-placed sticker feel; room-code badge gets a small "pop in" spring entrance.
- **In-round (RoundPlay/Timer/GameBoard/Keyboard):**
  - `BackgroundFX` at `energetic` intensity.
  - When `Timer`'s remaining percent drops below 25% (the existing `urgent` threshold), trigger a pulsing red edge-glow on the viewport and speed up `BackgroundFX` (pass intensity `"max"` while urgent).
  - Tile flip animation gets a bouncier easing/overshoot instead of the current linear rotateX.
  - Correct-guess feedback (`solved`) triggers a small confetti burst (reusing `canvas-confetti`, already a dependency) plus a spring-scale pop on the message banner.
  - On-screen `Keyboard` keys get a squash-and-stretch press animation.
  - Shake-on-error (already implemented in RoundPlay) kept, amplitude slightly increased.
- **Podium:** `BackgroundFX` at `max` intensity, plus the existing confetti cannon logic in Podium.tsx kept/expanded; podium bars get a staggered spring "rise up" entrance instead of appearing instantly.

### Micro-interactions

- Buttons (Start Game, Play Again, mode toggles): hover/press squash-and-stretch (scale + slight rotate) layered on top of the existing brutal-shadow hover-translate effect already in Lobby.tsx.
- Toasts (`Toast.tsx`): spring-physics entrance/exit instead of default.

### Non-goals
- No dark mode work (explicitly light-mode only per request).
- No new npm dependencies — motion via `framer-motion`, confetti via `canvas-confetti`, both already installed.
- No change to game rules, scoring, or Firestore data model beyond the two new fields on the Start request already covered in Part 1.

## Testing

- Existing `lib/game/validation.test.ts` gets cases for the widened `roomSettingsSchema` bounds and the new `startRoomSchema` shape.
- Manual verification (per this project's `verify` skill): create a room, set a non-30s duration in minutes, start game, confirm the round actually ends at the configured time; confirm infinite mode still shows "∞ No Clock" and never ends on its own.
- Manual visual pass across Lobby → RoundPlay → Podium to confirm animation intensity escalates and nothing blocks input (pointer-events-none on decorative layer verified).
