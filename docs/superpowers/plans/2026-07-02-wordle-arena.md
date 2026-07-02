# Wordle Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full real-time multiplayer Wordle game described in `docs/superpowers/specs/2026-07-02-wordle-arena-design.md` — room lobby, live round gameplay, scoring, leaderboard, podium, presence — in one pass.

**Architecture:** Next.js 16 App Router + TypeScript strict. Firestore is the source of truth for game state, read by clients via `onSnapshot`, written only by Route Handlers using the Firebase Admin SDK. Realtime Database provides connection presence, mirrored into Firestore's `connected` field via client-driven reconciliation calls (documented gap: no Cloud Functions in this Vercel-only deploy). Zustand mirrors Firestore snapshots into client state; Zod validates every request body.

**Tech Stack:** Next.js 16.2.10, React 19.2, TypeScript strict, Tailwind CSS v4, Firebase (firebase + firebase-admin), Zustand, Zod, Framer Motion, canvas-confetti, Vitest (pure-logic unit tests).

## Global Constraints

- Route Handler `params` are `Promise<T>` in Next.js 16 — always `await context.params`. (Async Request APIs, breaking change in v16.)
- Node.js 20.9+ required.
- Client SDK is read-only (`onSnapshot` subscriptions only); every write to `rooms/**` happens through a Route Handler using `firebase-admin`.
- Room codes are 6 chars, uppercase, charset excludes `0/O/1/I` to avoid visual ambiguity.
- Max 8 players per room; minimum 2 to start.
- Scoring: yellow = 5pts, green = 10pts, solve bonus = 50pts, speed multiplier = `clamp(1 + timeRemainingMs/roundDurationMs, 1, 2)` applied to the guess's (tile points + bonus) total, `Math.round`ed.
- Max 6 guess attempts per player per round, 5-letter words only.
- `.env.local`/`.env` values are never committed; `.env.example` documents required keys (already done in a prior step).

---

### Task 1: Dependencies and test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` command runs Vitest once; all later pure-logic tasks depend on this.

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
npm install firebase-admin zustand zod framer-motion canvas-confetti
npm install -D vitest @types/canvas-confetti
```

- [ ] **Step 2: Add the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the test script to package.json**

Add `"test": "vitest run"` to the `scripts` block in `package.json` (alongside `dev`, `build`, `start`, `lint`).

- [ ] **Step 4: Verify the test runner works with no tests yet**

Run: `npm test`
Expected: Vitest reports "No test files found" (or passes with 0 tests) — no errors from missing config.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add game dependencies and vitest test runner"
```

---

### Task 2: Shared types and room code generator

**Files:**
- Create: `lib/game/types.ts`
- Create: `lib/game/room-code.ts`
- Test: `lib/game/room-code.test.ts`

**Interfaces:**
- Produces: `TileColor`, `GuessAttempt`, `RoomStatus`, `RoomDoc`, `PlayerDoc`, `RoundDoc`, `GuessDoc` types (consumed by every later task); `generateRoomCode(): string`.

- [ ] **Step 1: Write the shared types**

```ts
// lib/game/types.ts
export type TileColor = "green" | "yellow" | "gray";

export interface GuessAttempt {
  word: string;
  tiles: TileColor[];
  pointsEarned: number;
  submittedAt: number;
}

export type RoomStatus = "lobby" | "in_round" | "round_end" | "finished";

export interface RoomDoc {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  roundCount: number;
  roundDurationMs: number;
  currentRound: number;
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
  roundEndsAt: number;
  status: "active" | "ended";
  solvedBy: string[];
}

export interface GuessDoc {
  attempts: GuessAttempt[];
  solved: boolean;
  totalPointsThisRound: number;
}
```

- [ ] **Step 2: Write the failing test for room code generation**

```ts
// lib/game/room-code.test.ts
import { describe, expect, it } from "vitest";
import { generateRoomCode, ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "./room-code";

describe("generateRoomCode", () => {
  it("returns a code of the configured length", () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("only uses characters from the charset", () => {
    const code = generateRoomCode();
    for (const char of code) {
      expect(ROOM_CODE_CHARSET).toContain(char);
    }
  });

  it("excludes visually ambiguous characters", () => {
    for (const banned of ["0", "O", "1", "I"]) {
      expect(ROOM_CODE_CHARSET).not.toContain(banned);
    }
  });

  it("produces different codes across many calls (extremely unlikely to collide)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- room-code`
Expected: FAIL — `./room-code` module does not exist yet.

- [ ] **Step 4: Implement the room code generator**

```ts
// lib/game/room-code.ts
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARSET[Math.floor(Math.random() * ROOM_CODE_CHARSET.length)];
  }
  return code;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- room-code`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/game/types.ts lib/game/room-code.ts lib/game/room-code.test.ts
git commit -m "feat: add shared game types and room code generator"
```

---

### Task 3: Tile-color computation

**Files:**
- Create: `lib/game/tiles.ts`
- Test: `lib/game/tiles.test.ts`

**Interfaces:**
- Consumes: `TileColor` from `lib/game/types.ts`
- Produces: `computeTileResults(secret: string, guess: string): TileColor[]` — used by the guess API route (Task 13).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/game/tiles.test.ts
import { describe, expect, it } from "vitest";
import { computeTileResults } from "./tiles";

describe("computeTileResults", () => {
  it("marks every letter green on an exact match", () => {
    expect(computeTileResults("crane", "crane")).toEqual([
      "green", "green", "green", "green", "green",
    ]);
  });

  it("marks every letter gray when there is no overlap", () => {
    expect(computeTileResults("abcde", "fghij")).toEqual([
      "gray", "gray", "gray", "gray", "gray",
    ]);
  });

  it("marks every letter yellow for a full anagram with no position matches", () => {
    // secret "words" vs guess "sword": every letter present, none in place
    expect(computeTileResults("words", "sword")).toEqual([
      "yellow", "yellow", "yellow", "yellow", "yellow",
    ]);
  });

  it("handles duplicate letters correctly (classic ABBEY vs BOBBY case)", () => {
    // secret A-B-B-E-Y, guess B-O-B-B-Y
    // pos0: B vs A -> no match, A goes into remaining pool
    // pos1: O vs B -> no match, B goes into remaining pool
    // pos2: B vs B -> green
    // pos3: B vs E -> no match, E goes into remaining pool
    // pos4: Y vs Y -> green
    // second pass: pos0 B consumes remaining B -> yellow; pos1 O has no remaining -> gray;
    // pos3 B has no remaining B left (already consumed) -> gray
    expect(computeTileResults("abbey", "bobby")).toEqual([
      "yellow", "gray", "green", "gray", "green",
    ]);
  });

  it("is case-insensitive", () => {
    expect(computeTileResults("CRANE", "crane")).toEqual([
      "green", "green", "green", "green", "green",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tiles`
Expected: FAIL — `./tiles` module does not exist yet.

- [ ] **Step 3: Implement tile computation**

```ts
// lib/game/tiles.ts
import type { TileColor } from "./types";

export function computeTileResults(secret: string, guess: string): TileColor[] {
  const secretLetters = secret.toLowerCase().split("");
  const guessLetters = guess.toLowerCase().split("");
  const result: TileColor[] = new Array(guessLetters.length).fill("gray");
  const remaining: Record<string, number> = {};

  for (let i = 0; i < guessLetters.length; i++) {
    if (guessLetters[i] === secretLetters[i]) {
      result[i] = "green";
    } else {
      remaining[secretLetters[i]] = (remaining[secretLetters[i]] ?? 0) + 1;
    }
  }

  for (let i = 0; i < guessLetters.length; i++) {
    if (result[i] === "green") continue;
    const letter = guessLetters[i];
    if (remaining[letter] > 0) {
      result[i] = "yellow";
      remaining[letter] -= 1;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tiles`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/game/tiles.ts lib/game/tiles.test.ts
git commit -m "feat: add tile-color computation with duplicate-letter handling"
```

---

### Task 4: Scoring logic

**Files:**
- Create: `lib/game/scoring.ts`
- Test: `lib/game/scoring.test.ts`

**Interfaces:**
- Consumes: `TileColor` from `lib/game/types.ts`
- Produces: `calculateSpeedMultiplier(timeRemainingMs, roundDurationMs): number`, `calculateGuessPoints(input: ScoreGuessInput): number` — used by the guess API route (Task 13).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/game/scoring.test.ts
import { describe, expect, it } from "vitest";
import { calculateGuessPoints, calculateSpeedMultiplier } from "./scoring";

describe("calculateSpeedMultiplier", () => {
  it("clamps to 2.0x when there is a full round of time remaining", () => {
    expect(calculateSpeedMultiplier(30000, 30000)).toBe(2);
  });

  it("clamps to 1.0x at zero time remaining", () => {
    expect(calculateSpeedMultiplier(0, 30000)).toBe(1);
  });

  it("never exceeds 2.0x even with excess time remaining", () => {
    expect(calculateSpeedMultiplier(999999, 30000)).toBe(2);
  });

  it("interpolates linearly between the bounds", () => {
    expect(calculateSpeedMultiplier(15000, 30000)).toBeCloseTo(1.5, 5);
  });
});

describe("calculateGuessPoints", () => {
  it("matches the spec example: instant all-green solve nets 200", () => {
    const points = calculateGuessPoints({
      tiles: ["green", "green", "green", "green", "green"],
      solved: true,
      timeRemainingMs: 30000,
      roundDurationMs: 30000,
    });
    expect(points).toBe(200);
  });

  it("matches the spec example: last-second correct guess nets close to 100", () => {
    const points = calculateGuessPoints({
      tiles: ["green", "green", "green", "green", "green"],
      solved: true,
      timeRemainingMs: 0,
      roundDurationMs: 30000,
    });
    expect(points).toBe(100);
  });

  it("banks partial points for an unsolved guess with some yellows", () => {
    const points = calculateGuessPoints({
      tiles: ["yellow", "yellow", "gray", "gray", "gray"],
      solved: false,
      timeRemainingMs: 15000,
      roundDurationMs: 30000,
    });
    // tilePoints = 10, bonus = 0, multiplier = 1.5 -> round(15) = 15
    expect(points).toBe(15);
  });

  it("gives zero points for an all-gray unsolved guess", () => {
    const points = calculateGuessPoints({
      tiles: ["gray", "gray", "gray", "gray", "gray"],
      solved: false,
      timeRemainingMs: 30000,
      roundDurationMs: 30000,
    });
    expect(points).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- scoring`
Expected: FAIL — `./scoring` module does not exist yet.

- [ ] **Step 3: Implement scoring**

```ts
// lib/game/scoring.ts
import type { TileColor } from "./types";

export interface ScoreGuessInput {
  tiles: TileColor[];
  solved: boolean;
  timeRemainingMs: number;
  roundDurationMs: number;
}

const YELLOW_POINTS = 5;
const GREEN_POINTS = 10;
const SOLVE_BONUS = 50;
const MIN_MULTIPLIER = 1;
const MAX_MULTIPLIER = 2;

export function calculateSpeedMultiplier(
  timeRemainingMs: number,
  roundDurationMs: number
): number {
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- scoring`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/game/scoring.ts lib/game/scoring.test.ts
git commit -m "feat: add speed-multiplier scoring matching spec examples"
```

---

### Task 5: Zod validation schemas

**Files:**
- Create: `lib/game/validation.ts`
- Test: `lib/game/validation.test.ts`

**Interfaces:**
- Produces: `nicknameSchema`, `createRoomSchema`, `joinRoomSchema`, `roomSettingsSchema`, `startRoomSchema`, `guessSchema`, `leaveRoomSchema`, `roundNextSchema`, `resetRoomSchema`, `presenceSchema` — consumed by every API route task (10, 12, 13, 15, 16, 17).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/game/validation.test.ts
import { describe, expect, it } from "vitest";
import { createRoomSchema, guessSchema, roomSettingsSchema } from "./validation";

describe("createRoomSchema", () => {
  it("accepts a valid nickname", () => {
    expect(createRoomSchema.safeParse({ nickname: "Alex" }).success).toBe(true);
  });

  it("rejects an empty nickname", () => {
    expect(createRoomSchema.safeParse({ nickname: "" }).success).toBe(false);
  });

  it("rejects a nickname over 20 characters", () => {
    expect(createRoomSchema.safeParse({ nickname: "a".repeat(21) }).success).toBe(false);
  });
});

describe("guessSchema", () => {
  it("accepts a 5-letter alphabetic word", () => {
    expect(guessSchema.safeParse({ playerId: "p1", word: "crane" }).success).toBe(true);
  });

  it("rejects a word that is not 5 letters", () => {
    expect(guessSchema.safeParse({ playerId: "p1", word: "cranes" }).success).toBe(false);
  });

  it("rejects a word containing non-letters", () => {
    expect(guessSchema.safeParse({ playerId: "p1", word: "cr4ne" }).success).toBe(false);
  });
});

describe("roomSettingsSchema", () => {
  it("accepts round count and duration within bounds", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", roundCount: 6, roundDurationMs: 30000 })
        .success
    ).toBe(true);
  });

  it("rejects a round count of zero", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", roundCount: 0, roundDurationMs: 30000 })
        .success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- validation`
Expected: FAIL — `./validation` module does not exist yet.

- [ ] **Step 3: Implement the schemas**

```ts
// lib/game/validation.ts
import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "Nickname is required")
  .max(20, "Nickname must be 20 characters or fewer");

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const roomSettingsSchema = z.object({
  playerId: z.string().min(1),
  roundCount: z.number().int().min(1).max(20),
  roundDurationMs: z.number().int().min(10000).max(120000),
});

export const startRoomSchema = z.object({
  playerId: z.string().min(1),
});

export const guessSchema = z.object({
  playerId: z.string().min(1),
  word: z
    .string()
    .length(5, "Guess must be exactly 5 letters")
    .regex(/^[a-zA-Z]+$/, "Guess must contain only letters"),
});

export const leaveRoomSchema = z.object({
  playerId: z.string().min(1),
});

export const roundNextSchema = z.object({
  playerId: z.string().min(1),
});

export const resetRoomSchema = z.object({
  playerId: z.string().min(1),
});

export const presenceSchema = z.object({
  playerId: z.string().min(1),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- validation`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/game/validation.ts lib/game/validation.test.ts
git commit -m "feat: add zod schemas for every client-to-server payload"
```

---

### Task 6: Word lists and secret-word selection

**Files:**
- Create: `lib/words/answers.ts`
- Create: `lib/words/valid-guesses.ts`
- Create: `lib/game/word-select.ts`
- Test: `lib/game/word-select.test.ts`

**Interfaces:**
- Produces: `ANSWERS: string[]`, `VALID_GUESSES: string[]`, `pickSecretWord(excludeWords?: string[]): string` — consumed by the start route (Task 12) and round/next route (Task 15).

- [ ] **Step 1: Source the word lists**

Primary approach: fetch the widely-mirrored original NYT Wordle word lists (answers ~2,315 words, allowed-guesses ~10,657 words) from a public GitHub-hosted mirror using the WebFetch tool, and write them into the two files below as plain `export const` string arrays (lowercase, deduplicated). Cite the source in a one-line comment at the top of each file.

If the fetch is unavailable or fails, use this verified ~450-word fallback for **both** files (a valid-guesses list must be a superset of answers; for the fallback path they're identical — call this out in a comment) and tell the user explicitly that the fallback was used instead of the full dictionary:

```ts
// lib/words/answers.ts
// Fallback list used only if the full ~2,315-word NYT Wordle answer list
// could not be fetched at build time — see word-select.ts callers for the
// primary sourcing path. If you see this comment, tell the user the
// fallback is active.
export const ANSWERS: string[] = [
  "about","above","abuse","actor","acute","admit","adopt","adult","after","again",
  "agent","agree","ahead","alarm","album","alert","alike","alive","allow","alone",
  "along","alter","among","anger","angle","angry","apart","apple","apply","arena",
  "argue","arise","armor","aside","asset","avoid","awake","award","aware","badly",
  "baker","bases","basic","basis","beach","began","begin","being","below","bench",
  "birth","black","blade","blame","blank","blast","blind","block","blood","board",
  "boost","booth","bound","brain","brand","brave","bread","break","breed","brief",
  "bring","broad","broke","brown","build","built","buyer","cable","candy","canon",
  "cargo","carry","carve","catch","cause","chain","chair","chalk","chaos","charm",
  "chart","chase","cheap","check","cheek","cheer","chess","chest","chief","child",
  "chill","china","chose","civil","claim","class","clean","clear","clerk","click",
  "cliff","climb","clock","close","cloth","cloud","coach","coast","could","count",
  "court","cover","craft","crash","crazy","cream","crime","cross","crowd","crown",
  "crude","curve","cycle","daily","dance","dealt","death","debut","delay","depth",
  "doubt","dozen","draft","drama","drank","drawn","dream","dress","drill","drink",
  "drive","drove","dying","eager","early","earth","eight","elite","empty","enemy",
  "enjoy","enter","entry","equal","error","event","every","exact","exist","extra",
  "faith","false","fault","fiber","field","fifth","fifty","fight","final","first",
  "fixed","flame","flash","fleet","floor","fluid","focus","force","forth","forty",
  "forum","found","frame","frank","fraud","fresh","front","fruit","fully","funny",
  "giant","given","glass","globe","going","grace","grade","grand","grant","grass",
  "grave","great","green","gross","group","grown","guard","guess","guest","guide",
  "happy","harsh","heart","heavy","hence","horse","hotel","house","human","humor",
  "ideal","image","index","inner","input","issue","ivory","jeans","joint","judge",
  "juice","jumbo","knife","knock","known","label","labor","large","laser","later",
  "laugh","layer","learn","least","leave","legal","lemon","level","light","limit",
  "lobby","local","logic","loose","lower","lucky","lunch","lying","magic","major",
  "maker","match","mayor","meant","medal","media","metal","meter","might","minor",
  "minus","mixed","model","moist","money","month","moral","motor","mount","mouse",
  "mouth","movie","music","needs","never","newly","night","noise","north","noted",
  "novel","nurse","occur","ocean","offer","often","order","other","ought","ounce",
  "owner","panel","panic","paper","party","pause","peace","phase","phone","photo",
  "piano","piece","pilot","pitch","place","plain","plane","plant","plate","point",
  "pound","power","press","price","pride","prime","print","prior","prize","proof",
  "proud","prove","queen","query","quick","quiet","quite","quote","radio","raise",
  "range","rapid","ratio","reach","ready","realm","rebel","refer","relax","reply",
  "rider","ridge","rifle","right","rigid","rival","river","robot","rocky","rough",
  "round","route","royal","rural","sadly","salad","sales","sauce","scale","scene",
  "scope","score","sense","serve","seven","shade","shake","shall","shame","shape",
  "share","sharp","sheep","sheer","sheet","shelf","shell","shift","shine","shirt",
  "shock","shoot","shore","short","shown","sight","silly","since","sixth","sixty",
  "skill","skull","sleep","slide","slope","small","smart","smell","smile","smoke",
  "snake","solid","solve","sorry","sound","south","space","spare","speak","speed",
  "spell","spend","spent","split","spoke","sport","staff","stage","stair","stake",
  "stand","stare","start","state","steam","steel","steep","stick","still","stock",
  "stone","store","storm","story","strip","stuck","study","stuff","style","sugar",
  "suite","super","sweet","swift","swing","sword","table","taken","taste","teach",
  "tenth","terms","thank","theme","there","thick","thing","think","third","those",
  "three","threw","throw","thumb","tiger","tight","timer","title","today","token",
  "topic","total","touch","tough","tower","trace","track","trade","trail","train",
  "treat","trend","trial","tribe","trick","tried","tries","truck","truly","trunk",
  "trust","truth","twice","twist","ultra","uncle","under","undue","union","unity",
  "until","upper","upset","urban","usage","usual","valid","value","video","virus",
  "visit","vital","voice","waste","watch","water","weird","wheel","where","which",
  "while","white","whole","whose","woman","women","world","worry","worse","worst",
  "worth","would","wound","write","wrong","yield","young","youth",
];
```

```ts
// lib/words/valid-guesses.ts
// Fallback: reuses the answers fallback list (see answers.ts). A real
// deployment should replace this with the ~10,657-word NYT allowed-guesses
// list, which is a strict superset of the answers list.
import { ANSWERS } from "./answers";

export const VALID_GUESSES: string[] = ANSWERS;
```

- [ ] **Step 2: Write the failing test for word selection**

```ts
// lib/game/word-select.test.ts
import { describe, expect, it } from "vitest";
import { pickSecretWord } from "./word-select";
import { ANSWERS } from "../words/answers";

describe("pickSecretWord", () => {
  it("returns a word from the answers list", () => {
    expect(ANSWERS).toContain(pickSecretWord());
  });

  it("avoids excluded words when alternatives exist", () => {
    const exclude = ANSWERS.slice(0, ANSWERS.length - 1);
    const picked = pickSecretWord(exclude);
    expect(picked).toBe(ANSWERS[ANSWERS.length - 1]);
  });

  it("falls back to the full pool if every word is excluded", () => {
    const picked = pickSecretWord(ANSWERS);
    expect(ANSWERS).toContain(picked);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- word-select`
Expected: FAIL — `./word-select` module does not exist yet.

- [ ] **Step 4: Implement word selection**

```ts
// lib/game/word-select.ts
import { ANSWERS } from "../words/answers";

export function pickSecretWord(excludeWords: string[] = []): string {
  const exclude = new Set(excludeWords.map((w) => w.toLowerCase()));
  const pool = ANSWERS.filter((w) => !exclude.has(w.toLowerCase()));
  const candidates = pool.length > 0 ? pool : ANSWERS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- word-select`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/words/answers.ts lib/words/valid-guesses.ts lib/game/word-select.ts lib/game/word-select.test.ts
git commit -m "feat: add word lists and secret-word selection"
```

---

### Task 7: Firebase setup and security rules

**Files:**
- Create: `lib/firebase/admin.ts`
- Create: `lib/firebase/client.ts`
- Create: `firestore.rules`
- Create: `database.rules.json`
- Create: `firebase.json`
- Delete: `firebase.ts` (superseded by `lib/firebase/client.ts`)
- Modify: `.env.example` (add `FIREBASE_SERVICE_ACCOUNT_KEY`)

**Interfaces:**
- Produces: `adminDb` (Firestore admin instance), `adminRtdb` (RTDB admin instance) from `lib/firebase/admin.ts`; `firestore`, `rtdb` (client instances) from `lib/firebase/client.ts` — consumed by every API route task and every client hook task.

- [ ] **Step 1: Write the Admin SDK setup**

```ts
// lib/firebase/admin.ts
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountBase64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY env var is not set");
  }
  const serviceAccount = JSON.parse(
    Buffer.from(serviceAccountBase64, "base64").toString("utf-8")
  );

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminRtdb = getDatabase(adminApp);
```

- [ ] **Step 2: Write the client SDK setup**

```ts
// lib/firebase/client.ts
import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const firestore = getFirestore(app);
export const rtdb = getDatabase(app);
```

- [ ] **Step 3: Delete the legacy root firebase.ts**

```bash
git rm firebase.ts
```

- [ ] **Step 4: Write Firestore security rules (client writes fully denied)**

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomCode} {
      allow read: if true;
      allow write: if false;

      match /players/{playerId} {
        allow read: if true;
        allow write: if false;
      }

      match /rounds/{roundNumber} {
        allow read: if true;
        allow write: if false;

        match /guesses/{playerId} {
          allow read: if true;
          allow write: if false;
        }
      }
    }
  }
}
```

- [ ] **Step 5: Write Realtime Database rules (presence only, open per the documented no-auth tradeoff)**

```json
// database.rules.json
{
  "rules": {
    "presence": {
      "$roomCode": {
        "$playerId": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

- [ ] **Step 6: Write the firebase.json pointing at both rule files**

```json
// firebase.json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "database": {
    "rules": "database.rules.json"
  }
}
```

- [ ] **Step 7: Add the service account env var to .env.example**

Add this line to `.env.example`:

```
FIREBASE_SERVICE_ACCOUNT_KEY=
```

Tell the user: generate this by going to Firebase Console → Project Settings → Service Accounts → Generate new private key, then base64-encode the downloaded JSON file (`base64 -w0 service-account.json` on Linux/macOS, or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))` in PowerShell) and paste the result as the value of `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env` (not `.env.example`).

- [ ] **Step 8: Verify the admin module loads without throwing when the env var is present**

Run: `node -e "require('dotenv').config(); require('./lib/firebase/admin.ts')"` is not directly runnable (TS), so instead verify via the dev server in Task 10 once an API route imports `adminDb`. For now, just verify the file compiles:

Run: `npx tsc --noEmit`
Expected: no type errors referencing `lib/firebase/admin.ts` or `lib/firebase/client.ts`.

- [ ] **Step 9: Commit**

```bash
git add lib/firebase/admin.ts lib/firebase/client.ts firestore.rules database.rules.json firebase.json .env.example
git commit -m "feat: add Firebase admin/client setup and security rules; remove legacy root firebase.ts"
```

---

### Task 8: Player session helper, Zustand store, room subscription hook

**Files:**
- Create: `lib/player-session.ts`
- Create: `store/useRoomStore.ts`
- Create: `hooks/useRoomSubscription.ts`

**Interfaces:**
- Consumes: `firestore` from `lib/firebase/client.ts`; `RoomDoc`, `PlayerDoc` from `lib/game/types.ts`
- Produces: `savePlayerId`, `getPlayerId`, `clearPlayerId`; `useRoomStore` (zustand store with `room`, `players`, `setRoom`, `setPlayers`); `useRoomSubscription(roomCode: string)` — consumed by the room page (Task 11) and every later client task.

- [ ] **Step 1: Write the localStorage session helper**

```ts
// lib/player-session.ts
const STORAGE_PREFIX = "wordle-arena:";

export function savePlayerId(roomCode: string, playerId: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}${roomCode}`, playerId);
}

export function getPlayerId(roomCode: string): string | null {
  return localStorage.getItem(`${STORAGE_PREFIX}${roomCode}`);
}

export function clearPlayerId(roomCode: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${roomCode}`);
}
```

- [ ] **Step 2: Write the Zustand store**

```ts
// store/useRoomStore.ts
import { create } from "zustand";
import type { PlayerDoc, RoomDoc } from "@/lib/game/types";

export type PlayerWithId = PlayerDoc & { id: string };

interface RoomState {
  room: RoomDoc | null;
  players: PlayerWithId[];
  setRoom: (room: RoomDoc | null) => void;
  setPlayers: (players: PlayerWithId[]) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  players: [],
  setRoom: (room) => set({ room }),
  setPlayers: (players) => set({ players }),
}));
```

- [ ] **Step 3: Write the room + players subscription hook**

```ts
// hooks/useRoomSubscription.ts
"use client";

import { useEffect } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { useRoomStore } from "@/store/useRoomStore";
import type { PlayerDoc, RoomDoc } from "@/lib/game/types";

export function useRoomSubscription(roomCode: string) {
  const setRoom = useRoomStore((s) => s.setRoom);
  const setPlayers = useRoomStore((s) => s.setPlayers);

  useEffect(() => {
    const roomRef = doc(firestore, "rooms", roomCode);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      setRoom(snap.exists() ? (snap.data() as RoomDoc) : null);
    });

    const playersRef = collection(firestore, "rooms", roomCode, "players");
    const unsubPlayers = onSnapshot(playersRef, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PlayerDoc) })));
    });

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomCode, setRoom, setPlayers]);
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/player-session.ts store/useRoomStore.ts hooks/useRoomSubscription.ts
git commit -m "feat: add player session helper, zustand store, and room subscription hook"
```

---

### Task 9: Landing page and join page

**Files:**
- Modify: `app/page.tsx`
- Create: `app/join/page.tsx`

**Interfaces:**
- Consumes: `savePlayerId` from `lib/player-session.ts`; `POST /api/rooms` and `POST /api/rooms/[code]/join` (built in Task 10 — these pages can be written now and will work once Task 10 lands).

- [ ] **Step 1: Replace the landing page with the create-room form**

```tsx
// app/page.tsx
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold">Wordle Arena</h1>
      <form onSubmit={handleCreateRoom} className="flex w-full max-w-sm flex-col gap-3">
        <input
          className="rounded border border-gray-400 px-3 py-2"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
        <a href="/join" className="text-center text-sm text-blue-600 underline">
          Have a room code? Join instead
        </a>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Write the join page**

```tsx
// app/join/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePlayerId } from "@/lib/player-session";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Join a Room</h1>
      <form onSubmit={handleJoin} className="flex w-full max-w-sm flex-col gap-3">
        <input
          className="rounded border border-gray-400 px-3 py-2 uppercase tracking-widest"
          placeholder="ROOM CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
        />
        <input
          className="rounded border border-gray-400 px-3 py-2"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/join/page.tsx
git commit -m "feat: add landing page and join page"
```

---

### Task 10: Room lifecycle API routes — create, join, leave, settings

**Files:**
- Create: `app/api/rooms/route.ts`
- Create: `app/api/rooms/[code]/join/route.ts`
- Create: `app/api/rooms/[code]/leave/route.ts`
- Create: `app/api/rooms/[code]/settings/route.ts`

**Interfaces:**
- Consumes: `adminDb` from `lib/firebase/admin.ts`; `generateRoomCode` from `lib/game/room-code.ts`; `createRoomSchema`, `joinRoomSchema`, `leaveRoomSchema`, `roomSettingsSchema` from `lib/game/validation.ts`
- Produces: room create/join/leave/settings HTTP behavior consumed by pages in Tasks 9 and 11.

- [ ] **Step 1: Write the create-room route**

```ts
// app/api/rooms/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { createRoomSchema } from "@/lib/game/validation";
import { generateRoomCode } from "@/lib/game/room-code";

const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const DEFAULT_ROUND_COUNT = 6;
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
      roundCount: DEFAULT_ROUND_COUNT,
      roundDurationMs: DEFAULT_ROUND_DURATION_MS,
      currentRound: 0,
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

- [ ] **Step 2: Write the join route**

```ts
// app/api/rooms/[code]/join/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { joinRoomSchema } from "@/lib/game/validation";
import type { RoomDoc } from "@/lib/game/types";

const MAX_PLAYERS = 8;

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const body = await request.json();
  const parsed = joinRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const roomRef = adminDb.collection("rooms").doc(code.toUpperCase());
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomSnap.data() as RoomDoc;
  if (Date.now() > room.expiresAt) {
    await roomRef.delete();
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.status !== "lobby") {
    return NextResponse.json({ error: "Game already started" }, { status: 409 });
  }

  const playersSnap = await roomRef.collection("players").get();
  if (playersSnap.size >= MAX_PLAYERS) {
    return NextResponse.json({ error: "Room is full" }, { status: 409 });
  }

  const playerId = randomUUID();
  await roomRef.collection("players").doc(playerId).set({
    nickname: parsed.data.nickname,
    isHost: false,
    connected: true,
    totalScore: 0,
    joinedAt: Date.now(),
    lastGuessAt: null,
  });

  return NextResponse.json({ playerId });
}
```

- [ ] **Step 3: Write the leave route (host reassignment + room cleanup)**

```ts
// app/api/rooms/[code]/leave/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { leaveRoomSchema } from "@/lib/game/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const body = await request.json();
  const parsed = leaveRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const roomRef = adminDb.collection("rooms").doc(code.toUpperCase());
  const playerRef = roomRef.collection("players").doc(parsed.data.playerId);

  await adminDb.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) return;
    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists) return;

    const wasHost = playerSnap.data()!.isHost === true;
    const remainingSnap = await tx.get(
      roomRef.collection("players").orderBy("joinedAt", "asc")
    );
    const remaining = remainingSnap.docs.filter((d) => d.id !== parsed.data.playerId);

    tx.delete(playerRef);

    if (remaining.length === 0) {
      tx.delete(roomRef);
      return;
    }

    if (wasHost) {
      const nextHost = remaining[0];
      tx.update(nextHost.ref, { isHost: true });
      tx.update(roomRef, { hostPlayerId: nextHost.id });
    }
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write the settings route (host-only, lobby-only)**

```ts
// app/api/rooms/[code]/settings/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { roomSettingsSchema } from "@/lib/game/validation";
import type { RoomDoc } from "@/lib/game/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const body = await request.json();
  const parsed = roomSettingsSchema.safeParse(body);
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
    return NextResponse.json({ error: "Only the host can change settings" }, { status: 403 });
  }
  if (room.status !== "lobby") {
    return NextResponse.json(
      { error: "Cannot change settings after the game has started" },
      { status: 409 }
    );
  }

  await roomRef.update({
    roundCount: parsed.data.roundCount,
    roundDurationMs: parsed.data.roundDurationMs,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Verify end-to-end with the dev server**

Run: `npm run dev` (in one terminal), then in another:

```bash
curl -s -X POST http://localhost:3000/api/rooms -H "Content-Type: application/json" -d '{"nickname":"Alice"}'
```

Expected: JSON like `{"code":"AB3C4D","playerId":"<uuid>"}`. Take the `code` from the response and:

```bash
curl -s -X POST http://localhost:3000/api/rooms/<code>/join -H "Content-Type: application/json" -d '{"nickname":"Bob"}'
```

Expected: `{"playerId":"<uuid>"}`. Confirm both player docs exist by checking the Firebase Console → Firestore → `rooms/<code>/players`.

- [ ] **Step 6: Commit**

```bash
git add app/api/rooms
git commit -m "feat: add room create/join/leave/settings API routes"
```

---

### Task 11: Room page shell and Lobby component

**Files:**
- Create: `app/room/[code]/page.tsx`
- Create: `components/Lobby.tsx`
- Create: `components/JoinInline.tsx`

**Interfaces:**
- Consumes: `useRoomSubscription` (Task 8), `useRoomStore` (Task 8), `getPlayerId`/`savePlayerId` (Task 8), `PlayerWithId` type (Task 8)
- Produces: `<RoomPage>` renders `<Lobby>` while `room.status === "lobby"`; later tasks (13, 15, 16, 17) extend this page's render branches for the other statuses.

- [ ] **Step 1: Write the inline join form (for players who land on the room URL directly)**

```tsx
// components/JoinInline.tsx
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
    <form onSubmit={handleJoin} className="flex w-full max-w-sm flex-col gap-3">
      <p className="text-center text-lg font-semibold">Join room {roomCode}</p>
      <input
        className="rounded border border-gray-400 px-3 py-2"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Room"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Write the Lobby component**

```tsx
// components/Lobby.tsx
"use client";

import { useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { RoomDoc } from "@/lib/game/types";

interface LobbyProps {
  room: RoomDoc;
  players: PlayerWithId[];
  myPlayerId: string;
  roomCode: string;
  onLeave: () => void;
}

export function Lobby({ room, players, myPlayerId, roomCode, onLeave }: LobbyProps) {
  const isHost = room.hostPlayerId === myPlayerId;
  const [roundCount, setRoundCount] = useState(room.roundCount);
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

  async function saveSettings() {
    await fetch(`/api/rooms/${roomCode}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        roundCount,
        roundDurationMs: roundDurationSec * 1000,
      }),
    });
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
      <div className="rounded border border-gray-300 p-4 text-center">
        <p className="text-sm text-gray-500">Room code</p>
        <p className="text-3xl font-bold tracking-widest">{roomCode}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
          >
            <span>{p.nickname}</span>
            {p.isHost && (
              <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-semibold">
                Host
              </span>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-3">
          <label className="flex items-center justify-between text-sm">
            Rounds
            <input
              type="number"
              min={1}
              max={20}
              value={roundCount}
              onChange={(e) => setRoundCount(Number(e.target.value))}
              onBlur={saveSettings}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            Round duration (sec)
            <input
              type="number"
              min={10}
              max={120}
              value={roundDurationSec}
              onChange={(e) => setRoundDurationSec(Number(e.target.value))}
              onBlur={saveSettings}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <button
            onClick={startGame}
            disabled={players.length < 2 || starting}
            className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {players.length < 2 ? "Need 2+ players" : starting ? "Starting..." : "Start Game"}
          </button>
        </div>
      )}
      <button
        onClick={leaveRoom}
        disabled={leaving}
        className="text-sm text-gray-500 underline disabled:opacity-50"
      >
        {leaving ? "Leaving..." : "Leave Room"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Write the room page shell**

```tsx
// app/room/[code]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearPlayerId, getPlayerId, savePlayerId } from "@/lib/player-session";
import { useRoomStore } from "@/store/useRoomStore";
import { useRoomSubscription } from "@/hooks/useRoomSubscription";
import { Lobby } from "@/components/Lobby";
import { JoinInline } from "@/components/JoinInline";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = params.code.toUpperCase();

  const [myPlayerId, setMyPlayerId] = useState<string | null | undefined>(undefined);

  useRoomSubscription(roomCode);
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);

  useEffect(() => {
    setMyPlayerId(getPlayerId(roomCode));
  }, [roomCode]);

  function handleLeave() {
    clearPlayerId(roomCode);
    router.push("/");
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
          onJoined={(id) => {
            savePlayerId(roomCode, id);
            setMyPlayerId(id);
          }}
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
      {room.status === "lobby" && (
        <Lobby
          room={room}
          players={players}
          myPlayerId={myPlayerId}
          roomCode={roomCode}
          onLeave={handleLeave}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

Run `npm run dev`, open `/` in two different browser windows (or one normal + one incognito, since player identity is per-localStorage), create a room in one, and join it from the other using the room code. Confirm both nicknames appear in each window's lobby roster within ~1 second of the other joining (Firestore `onSnapshot` propagation) — this proves the realtime wiring works end-to-end before gameplay is added. Then click "Leave Room" as the non-host player and confirm they're redirected to `/` and disappear from the host's roster; rejoin, then click "Leave Room" as the host and confirm the remaining player's `isHost` flips to `true` in the Firebase Console.

- [ ] **Step 5: Commit**

```bash
git add app/room components/Lobby.tsx components/JoinInline.tsx
git commit -m "feat: add room page shell and lobby with realtime roster"
```

---

### Task 12: Round lifecycle helpers and start route

**Files:**
- Create: `lib/game/round-lifecycle.ts`
- Create: `app/api/rooms/[code]/start/route.ts`

**Interfaces:**
- Consumes: `pickSecretWord` (Task 6), `startRoomSchema` (Task 5), `adminDb` (Task 7)
- Produces: `finalizeRoundIfNeeded(db, roomCode, roundNumber)`, `allPlayersDone(db, roomCode, roundNumber)` — consumed by the guess route (Task 13) and round/check route (Task 13).

- [ ] **Step 1: Write the round lifecycle helpers**

```ts
// lib/game/round-lifecycle.ts
import type { Firestore } from "firebase-admin/firestore";
import type { GuessDoc } from "./types";

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
    tx.update(roomRef, { status: "round_end" });
  });
}

export async function allPlayersDone(
  db: Firestore,
  roomCode: string,
  roundNumber: number
): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const playersSnap = await roomRef.collection("players").get();
  const guessesSnap = await roomRef
    .collection("rounds")
    .doc(String(roundNumber))
    .collection("guesses")
    .get();

  const guessesByPlayer = new Map<string, GuessDoc>(
    guessesSnap.docs.map((d) => [d.id, d.data() as GuessDoc])
  );

  return playersSnap.docs.every((playerDoc) => {
    const guess = guessesByPlayer.get(playerDoc.id);
    if (!guess) return false;
    return guess.solved === true || guess.attempts.length >= 6;
  });
}
```

- [ ] **Step 2: Write the start route**

```ts
// app/api/rooms/[code]/start/route.ts
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

  const secretWord = pickSecretWord();
  const now = Date.now();

  await roomRef.collection("rounds").doc("1").set({
    roundNumber: 1,
    secretWord,
    startedAt: now,
    roundEndsAt: now + room.roundDurationMs,
    status: "active",
    solvedBy: [],
  });

  await roomRef.update({ status: "in_round", currentRound: 1 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify manually**

With two players already in a room (from Task 11's manual test), have the host click "Start Game" in the browser. Confirm in the Firebase Console that `rooms/<code>/rounds/1` was created with a `secretWord`, and that `rooms/<code>` now has `status: "in_round"` and `currentRound: 1`. The room page won't visually change yet (no `in_round` render branch exists until Task 14) — that's expected.

- [ ] **Step 4: Commit**

```bash
git add lib/game/round-lifecycle.ts app/api/rooms/[code]/start
git commit -m "feat: add round lifecycle helpers and start-round API route"
```

---

### Task 13: Guess API route and round/check route

**Files:**
- Create: `app/api/rooms/[code]/guess/route.ts`
- Create: `app/api/rooms/[code]/round/check/route.ts`

**Interfaces:**
- Consumes: `guessSchema` (Task 5), `VALID_GUESSES` (Task 6), `computeTileResults` (Task 3), `calculateGuessPoints` (Task 4), `finalizeRoundIfNeeded`/`allPlayersDone` (Task 12)
- Produces: guess submission behavior and timer-expiry finalization, consumed by `RoundPlay` (Task 14).

- [ ] **Step 1: Write the guess route**

```ts
// app/api/rooms/[code]/guess/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { guessSchema } from "@/lib/game/validation";
import { VALID_GUESSES } from "@/lib/words/valid-guesses";
import { computeTileResults } from "@/lib/game/tiles";
import { calculateGuessPoints } from "@/lib/game/scoring";
import { finalizeRoundIfNeeded, allPlayersDone } from "@/lib/game/round-lifecycle";
import type { GuessDoc, PlayerDoc, RoomDoc, RoundDoc } from "@/lib/game/types";

const VALID_GUESS_SET = new Set(VALID_GUESSES.map((w) => w.toLowerCase()));
const MAX_ATTEMPTS = 6;
const MIN_GUESS_INTERVAL_MS = 400;

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const body = await request.json();
  const parsed = guessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { playerId, word } = parsed.data;
  const guessWord = word.toLowerCase();

  const roomRef = adminDb.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomSnap.data() as RoomDoc;
  if (room.status !== "in_round") {
    return NextResponse.json({ error: "No round is active" }, { status: 409 });
  }

  const playerRef = roomRef.collection("players").doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    return NextResponse.json({ error: "Player not found in this room" }, { status: 404 });
  }
  const player = playerSnap.data() as PlayerDoc;

  const now = Date.now();
  if (player.lastGuessAt && now - player.lastGuessAt < MIN_GUESS_INTERVAL_MS) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }

  const roundNumber = room.currentRound;
  const roundRef = roomRef.collection("rounds").doc(String(roundNumber));
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists || (roundSnap.data() as RoundDoc).status !== "active") {
    return NextResponse.json({ error: "Round is not active" }, { status: 409 });
  }
  const round = roundSnap.data() as RoundDoc;
  if (now >= round.roundEndsAt) {
    await finalizeRoundIfNeeded(adminDb, roomCode, roundNumber);
    return NextResponse.json({ error: "Time is up" }, { status: 409 });
  }

  if (!VALID_GUESS_SET.has(guessWord)) {
    return NextResponse.json({ error: "Not a valid word" }, { status: 422 });
  }

  const guessRef = roundRef.collection("guesses").doc(playerId);
  const guessSnap = await guessRef.get();
  const existing: GuessDoc = guessSnap.exists
    ? (guessSnap.data() as GuessDoc)
    : { attempts: [], solved: false, totalPointsThisRound: 0 };

  if (existing.solved || existing.attempts.length >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "No attempts remaining" }, { status: 409 });
  }

  const tiles = computeTileResults(round.secretWord, guessWord);
  const solved = tiles.every((t) => t === "green");
  const timeRemainingMs = Math.max(0, round.roundEndsAt - now);
  const pointsEarned = calculateGuessPoints({
    tiles,
    solved,
    timeRemainingMs,
    roundDurationMs: room.roundDurationMs,
  });

  const attempt = { word: guessWord, tiles, pointsEarned, submittedAt: now };
  const updatedAttempts = [...existing.attempts, attempt];

  await guessRef.set({
    attempts: updatedAttempts,
    solved,
    totalPointsThisRound: existing.totalPointsThisRound + pointsEarned,
  });

  await playerRef.update({
    lastGuessAt: now,
    totalScore: player.totalScore + pointsEarned,
  });

  if (solved) {
    await roundRef.update({ solvedBy: [...round.solvedBy, playerId] });
  }

  const done = await allPlayersDone(adminDb, roomCode, roundNumber);
  if (done) {
    await finalizeRoundIfNeeded(adminDb, roomCode, roundNumber);
  }

  return NextResponse.json({ tiles, solved, pointsEarned });
}
```

- [ ] **Step 2: Write the round/check route**

```ts
// app/api/rooms/[code]/round/check/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { finalizeRoundIfNeeded } from "@/lib/game/round-lifecycle";
import type { RoomDoc, RoundDoc } from "@/lib/game/types";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const roomRef = adminDb.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomSnap.data() as RoomDoc;
  if (room.status !== "in_round") {
    return NextResponse.json({ ok: true, finalized: false });
  }

  const roundRef = roomRef.collection("rounds").doc(String(room.currentRound));
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists) {
    return NextResponse.json({ ok: true, finalized: false });
  }
  const round = roundSnap.data() as RoundDoc;
  if (Date.now() < round.roundEndsAt) {
    return NextResponse.json({ ok: true, finalized: false });
  }

  await finalizeRoundIfNeeded(adminDb, roomCode, room.currentRound);
  return NextResponse.json({ ok: true, finalized: true });
}
```

- [ ] **Step 3: Verify manually with curl**

With a room already `in_round` (from Task 12's manual test), fetch the secret word from the Firebase Console (`rooms/<code>/rounds/1/secretWord`) to construct a guess request:

```bash
curl -s -X POST http://localhost:3000/api/rooms/<code>/guess -H "Content-Type: application/json" -d '{"playerId":"<hostPlayerId>","word":"crane"}'
```

Expected: `{"tiles":[...5 colors...],"solved":false-or-true,"pointsEarned":<number>}`. Submitting the exact secret word should return `"solved":true` and all-green tiles. Submitting a non-dictionary word like `"zzzzz"` should return 422 with `{"error":"Not a valid word"}` and must NOT appear in the guess doc's `attempts` array (confirm via Firebase Console).

- [ ] **Step 4: Commit**

```bash
git add app/api/rooms/[code]/guess app/api/rooms/[code]/round
git commit -m "feat: add guess submission and round-expiry check API routes"
```

---

### Task 14: Timer, GameBoard, Keyboard, and RoundPlay

**Files:**
- Create: `components/Timer.tsx`
- Create: `components/GameBoard.tsx`
- Create: `components/Keyboard.tsx`
- Create: `components/RoundPlay.tsx`
- Create: `hooks/useRoundSubscription.ts`
- Create: `hooks/useMyGuessSubscription.ts`
- Modify: `app/room/[code]/page.tsx` (add the `in_round` render branch)

**Interfaces:**
- Consumes: `firestore` (Task 7), `RoundDoc`/`GuessDoc`/`GuessAttempt`/`TileColor` (Task 2)
- Produces: full round-play UI, wired into the room page.

- [ ] **Step 1: Write the round subscription hook**

```ts
// hooks/useRoundSubscription.ts
"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { RoundDoc } from "@/lib/game/types";

export function useRoundSubscription(roomCode: string, roundNumber: number) {
  const [round, setRound] = useState<RoundDoc | null>(null);

  useEffect(() => {
    if (roundNumber < 1) {
      setRound(null);
      return;
    }
    const ref = doc(firestore, "rooms", roomCode, "rounds", String(roundNumber));
    const unsub = onSnapshot(ref, (snap) => {
      setRound(snap.exists() ? (snap.data() as RoundDoc) : null);
    });
    return () => unsub();
  }, [roomCode, roundNumber]);

  return round;
}
```

- [ ] **Step 2: Write the own-guess subscription hook**

```ts
// hooks/useMyGuessSubscription.ts
"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { GuessDoc } from "@/lib/game/types";

export function useMyGuessSubscription(
  roomCode: string,
  roundNumber: number,
  playerId: string | null
) {
  const [guess, setGuess] = useState<GuessDoc | null>(null);

  useEffect(() => {
    if (!playerId || roundNumber < 1) {
      setGuess(null);
      return;
    }
    const ref = doc(
      firestore,
      "rooms",
      roomCode,
      "rounds",
      String(roundNumber),
      "guesses",
      playerId
    );
    const unsub = onSnapshot(ref, (snap) => {
      setGuess(snap.exists() ? (snap.data() as GuessDoc) : null);
    });
    return () => unsub();
  }, [roomCode, roundNumber, playerId]);

  return guess;
}
```

- [ ] **Step 3: Write the Timer component**

```tsx
// components/Timer.tsx
"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  roundEndsAt: number;
  roundDurationMs: number;
  onExpire: () => void;
}

export function Timer({ roundEndsAt, roundDurationMs, onExpire }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, roundEndsAt - Date.now()));

  useEffect(() => {
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

  const seconds = Math.ceil(remainingMs / 1000);
  const percent = Math.min(100, Math.max(0, (remainingMs / roundDurationMs) * 100));

  return (
    <div className="w-full max-w-md">
      <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
        <div
          className="h-full bg-green-500 transition-[width] duration-200 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-center text-sm text-gray-600">{seconds}s</p>
    </div>
  );
}
```

- [ ] **Step 4: Write the GameBoard component**

```tsx
// components/GameBoard.tsx
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
  green: "bg-green-600 border-green-600 text-white",
  yellow: "bg-yellow-500 border-yellow-500 text-white",
  gray: "bg-gray-500 border-gray-500 text-white",
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
                  initial={{ rotateX: 0 }}
                  animate={{ rotateX: [0, 90, 0] }}
                  transition={{ duration: 0.5, delay: colIndex * 0.15 }}
                  className={`flex h-12 w-12 items-center justify-center rounded border-2 text-2xl font-bold sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
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
                  className="flex h-12 w-12 items-center justify-center rounded border-2 border-gray-400 text-2xl font-bold sm:h-14 sm:w-14"
                >
                  {letter}
                </div>
              );
            }
            return (
              <div
                key={colIndex}
                className="flex h-12 w-12 items-center justify-center rounded border-2 border-gray-200 sm:h-14 sm:w-14"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write the Keyboard component**

```tsx
// components/Keyboard.tsx
"use client";

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
  green: "bg-green-600 text-white",
  yellow: "bg-yellow-500 text-white",
  gray: "bg-gray-500 text-white",
};

export function Keyboard({ attempts, onKeyPress, disabled }: KeyboardProps) {
  const keyStates = computeKeyStates(attempts);

  return (
    <div className="flex flex-col gap-1.5">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1">
          {rowIndex === 2 && (
            <button
              disabled={disabled}
              onClick={() => onKeyPress("ENTER")}
              className="rounded bg-gray-300 px-3 py-3 text-xs font-semibold disabled:opacity-50"
            >
              ENTER
            </button>
          )}
          {row.split("").map((letter) => (
            <button
              key={letter}
              disabled={disabled}
              onClick={() => onKeyPress(letter)}
              className={`rounded px-2.5 py-3 text-sm font-semibold disabled:opacity-50 ${
                keyStates[letter] ? KEY_COLORS[keyStates[letter]] : "bg-gray-200"
              }`}
            >
              {letter}
            </button>
          ))}
          {rowIndex === 2 && (
            <button
              disabled={disabled}
              onClick={() => onKeyPress("BACKSPACE")}
              className="rounded bg-gray-300 px-3 py-3 text-xs font-semibold disabled:opacity-50"
            >
              Del
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Write the RoundPlay container**

```tsx
// components/RoundPlay.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GameBoard } from "./GameBoard";
import { Keyboard } from "./Keyboard";
import { Timer } from "./Timer";
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

  const attempts = myGuess?.attempts ?? [];
  const solved = myGuess?.solved ?? false;
  const outOfAttempts = attempts.length >= 6;
  const canPlay = !solved && !outOfAttempts;

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
      <Timer
        roundEndsAt={round.roundEndsAt}
        roundDurationMs={roundDurationMs}
        onExpire={handleTimerExpire}
      />
      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <GameBoard attempts={attempts} currentGuess={canPlay ? currentGuess : ""} />
      </motion.div>
      {solved && (
        <p className="font-semibold text-green-600">You solved it! Waiting for others...</p>
      )}
      {outOfAttempts && !solved && (
        <p className="font-semibold text-gray-600">Out of guesses. Waiting for others...</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Keyboard attempts={attempts} onKeyPress={handleKeyPress} disabled={!canPlay || submitting} />
    </div>
  );
}
```

- [ ] **Step 7: Wire the `in_round` branch into the room page**

In `app/room/[code]/page.tsx`, add these imports:

```ts
import { useRoundSubscription } from "@/hooks/useRoundSubscription";
import { useMyGuessSubscription } from "@/hooks/useMyGuessSubscription";
import { RoundPlay } from "@/components/RoundPlay";
```

Add these two hook calls right after the existing `useRoomSubscription(roomCode)` line (before the `useEffect` that reads `myPlayerId` — they can safely run with `room` possibly `null` since both hooks guard on `roundNumber < 1`):

```ts
const round = useRoundSubscription(roomCode, room?.currentRound ?? 0);
const myGuess = useMyGuessSubscription(roomCode, room?.currentRound ?? 0, myPlayerId ?? null);
```

Add this branch inside the final `<main>` block, after the `Lobby` branch:

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

- [ ] **Step 8: Verify manually**

With two players in a room, host starts the game. Both browser windows should now show the timer and empty 6x5 grid. Type a guess and press Enter (or click ENTER on-screen) — confirm the tile flip animation plays and the row shows the correct green/yellow/gray colors, and that the keyboard updates to reflect used letters. Submit an invalid word (e.g. "zzzzz") and confirm the board shakes and shows an inline error without consuming a row. Let the timer run out (or set a short `roundDurationSec` in the lobby first) and confirm the round transitions away from `in_round` (it will show a blank main area until Task 15 adds the `round_end` branch — that's expected here).

- [ ] **Step 9: Commit**

```bash
git add components/Timer.tsx components/GameBoard.tsx components/Keyboard.tsx components/RoundPlay.tsx hooks/useRoundSubscription.ts hooks/useMyGuessSubscription.ts app/room/[code]/page.tsx
git commit -m "feat: add round gameplay UI (timer, board, keyboard) wired to guess API"
```

---

### Task 15: Round/next route, Leaderboard, and RoundEnd

**Files:**
- Create: `app/api/rooms/[code]/round/next/route.ts`
- Create: `hooks/useRoundGuesses.ts`
- Create: `components/Leaderboard.tsx`
- Create: `components/RoundEnd.tsx`
- Modify: `app/room/[code]/page.tsx` (add the `round_end` render branch)

**Interfaces:**
- Consumes: `pickSecretWord` (Task 6), `roundNextSchema` (Task 5), `PlayerWithId` (Task 8)
- Produces: leaderboard reveal + multi-round advancement, wired into the room page.

- [ ] **Step 1: Write the round/next route**

```ts
// app/api/rooms/[code]/round/next/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { roundNextSchema } from "@/lib/game/validation";
import { pickSecretWord } from "@/lib/game/word-select";
import type { RoomDoc, RoundDoc } from "@/lib/game/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const body = await request.json();
  const parsed = roundNextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const roomRef = adminDb.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomSnap.data() as RoomDoc;
  if (room.hostPlayerId !== parsed.data.playerId) {
    return NextResponse.json({ error: "Only the host can advance the round" }, { status: 403 });
  }
  if (room.status !== "round_end") {
    return NextResponse.json({ error: "Round has not ended yet" }, { status: 409 });
  }

  if (room.currentRound >= room.roundCount) {
    await roomRef.update({ status: "finished" });
    return NextResponse.json({ ok: true, finished: true });
  }

  const previousRoundsSnap = await roomRef.collection("rounds").get();
  const usedWords = previousRoundsSnap.docs.map((d) => (d.data() as RoundDoc).secretWord);

  const nextRoundNumber = room.currentRound + 1;
  const secretWord = pickSecretWord(usedWords);
  const now = Date.now();

  await roomRef.collection("rounds").doc(String(nextRoundNumber)).set({
    roundNumber: nextRoundNumber,
    secretWord,
    startedAt: now,
    roundEndsAt: now + room.roundDurationMs,
    status: "active",
    solvedBy: [],
  });

  await roomRef.update({ status: "in_round", currentRound: nextRoundNumber });

  return NextResponse.json({ ok: true, finished: false });
}
```

- [ ] **Step 2: Write the round-guesses hook (all players' guesses, only enabled after round end)**

```ts
// hooks/useRoundGuesses.ts
"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { GuessDoc } from "@/lib/game/types";

export function useRoundGuesses(
  roomCode: string,
  roundNumber: number,
  enabled: boolean
): Record<string, GuessDoc> {
  const [guesses, setGuesses] = useState<Record<string, GuessDoc>>({});

  useEffect(() => {
    if (!enabled || roundNumber < 1) {
      setGuesses({});
      return;
    }
    const ref = collection(
      firestore,
      "rooms",
      roomCode,
      "rounds",
      String(roundNumber),
      "guesses"
    );
    const unsub = onSnapshot(ref, (snap) => {
      const map: Record<string, GuessDoc> = {};
      snap.forEach((d) => {
        map[d.id] = d.data() as GuessDoc;
      });
      setGuesses(map);
    });
    return () => unsub();
  }, [roomCode, roundNumber, enabled]);

  return guesses;
}
```

- [ ] **Step 3: Write the Leaderboard component**

```tsx
// components/Leaderboard.tsx
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
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm text-gray-400">#{index + 1}</span>
              {player.nickname}
            </span>
            <span className="flex items-center gap-2">
              {pointsThisRound?.[player.id] != null && (
                <span className="text-xs text-green-600">+{pointsThisRound[player.id]}</span>
              )}
              <span className="font-semibold">{player.totalScore}</span>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
```

- [ ] **Step 4: Write the RoundEnd component**

```tsx
// components/RoundEnd.tsx
"use client";

import { Leaderboard } from "./Leaderboard";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc, RoundDoc } from "@/lib/game/types";

interface RoundEndProps {
  round: RoundDoc;
  players: PlayerWithId[];
  guessesByPlayer: Record<string, GuessDoc>;
  isHost: boolean;
  isFinalRound: boolean;
  onNext: () => void;
  advancing: boolean;
}

export function RoundEnd({
  round,
  players,
  guessesByPlayer,
  isHost,
  isFinalRound,
  onNext,
  advancing,
}: RoundEndProps) {
  const pointsThisRound: Record<string, number> = {};
  for (const player of players) {
    pointsThisRound[player.id] = guessesByPlayer[player.id]?.totalPointsThisRound ?? 0;
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-gray-500">The word was</p>
        <p className="text-3xl font-bold uppercase tracking-widest">{round.secretWord}</p>
      </div>
      <Leaderboard players={players} pointsThisRound={pointsThisRound} />
      {isHost && (
        <button
          onClick={onNext}
          disabled={advancing}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {advancing ? "Loading..." : isFinalRound ? "See Final Results" : "Next Round"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire the `round_end` branch into the room page**

Add these imports to `app/room/[code]/page.tsx`:

```ts
import { useRoundGuesses } from "@/hooks/useRoundGuesses";
import { RoundEnd } from "@/components/RoundEnd";
```

Add this hook call and handler function inside the component, near the other hooks:

```ts
const guessesByPlayer = useRoundGuesses(
  roomCode,
  room?.currentRound ?? 0,
  room?.status === "round_end" || room?.status === "finished"
);
const [advancing, setAdvancing] = useState(false);

async function handleNextRound() {
  if (!myPlayerId) return;
  setAdvancing(true);
  await fetch(`/api/rooms/${roomCode}/round/next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId: myPlayerId }),
  });
  setAdvancing(false);
}
```

Add this branch after the `in_round` branch:

```tsx
{room.status === "round_end" && round && (
  <RoundEnd
    round={round}
    players={players}
    guessesByPlayer={guessesByPlayer}
    isHost={room.hostPlayerId === myPlayerId}
    isFinalRound={room.currentRound >= room.roundCount}
    onNext={handleNextRound}
    advancing={advancing}
  />
)}
```

- [ ] **Step 6: Verify manually**

Play a round to completion (either solve it or let the timer expire in both browser windows). Confirm: the secret word is revealed, both players' scores appear with a `+N` this-round delta, the list re-sorts with a smooth animation if rankings changed, and the host sees a "Next Round" button that starts round 2 when clicked (non-host players should not see the button).

- [ ] **Step 7: Commit**

```bash
git add app/api/rooms/[code]/round/next hooks/useRoundGuesses.ts components/Leaderboard.tsx components/RoundEnd.tsx app/room/[code]/page.tsx
git commit -m "feat: add round advancement, leaderboard reveal, and round-end summary"
```

---

### Task 16: Reset route and Podium

**Files:**
- Create: `app/api/rooms/[code]/reset/route.ts`
- Create: `components/Podium.tsx`
- Modify: `app/room/[code]/page.tsx` (add the `finished` render branch)

**Interfaces:**
- Consumes: `resetRoomSchema` (Task 5), `Leaderboard`-style ranking logic, `canvas-confetti` (Task 1)
- Produces: end-game podium + play-again flow.

- [ ] **Step 1: Write the reset route**

```ts
// app/api/rooms/[code]/reset/route.ts
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { resetRoomSchema } from "@/lib/game/validation";
import type { RoomDoc } from "@/lib/game/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const body = await request.json();
  const parsed = resetRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const roomRef = adminDb.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomSnap.data() as RoomDoc;
  if (room.hostPlayerId !== parsed.data.playerId) {
    return NextResponse.json({ error: "Only the host can restart the game" }, { status: 403 });
  }
  if (room.status !== "finished") {
    return NextResponse.json({ error: "Game is not finished" }, { status: 409 });
  }

  const roundsSnap = await roomRef.collection("rounds").get();
  await Promise.all(
    roundsSnap.docs.map(async (roundDoc) => {
      const guessesSnap = await roundDoc.ref.collection("guesses").get();
      await Promise.all(guessesSnap.docs.map((g) => g.ref.delete()));
      await roundDoc.ref.delete();
    })
  );

  const playersSnap = await roomRef.collection("players").get();
  await Promise.all(
    playersSnap.docs.map((p) => p.ref.update({ totalScore: 0, lastGuessAt: null }))
  );

  await roomRef.update({ status: "lobby", currentRound: 0 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the Podium component**

```tsx
// components/Podium.tsx
"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { PlayerWithId } from "@/store/useRoomStore";

interface PodiumProps {
  players: PlayerWithId[];
  isHost: boolean;
  onPlayAgain: () => void;
  resetting: boolean;
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

export function Podium({ players, isHost, onPlayAgain, resetting }: PodiumProps) {
  const ranked = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const [first, second, third] = ranked;

  useEffect(() => {
    if (!first) return;
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
  }, [first?.id]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
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

- [ ] **Step 3: Wire the `finished` branch into the room page**

Add these to `app/room/[code]/page.tsx`:

```ts
import { Podium } from "@/components/Podium";
```

```ts
const [resetting, setResetting] = useState(false);

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
```

```tsx
{room.status === "finished" && (
  <Podium
    players={players}
    isHost={room.hostPlayerId === myPlayerId}
    onPlayAgain={handlePlayAgain}
    resetting={resetting}
  />
)}
```

- [ ] **Step 4: Verify manually**

Play through all configured rounds (set `roundCount` to 2 in the lobby to make this quick to test). After the last round's "See Final Results" click, confirm the podium renders with confetti for 1st place and correct rankings, and that "Play Again" (host only) resets both players' scores to 0 and returns everyone to the lobby with the same room code and roster intact.

- [ ] **Step 5: Commit**

```bash
git add app/api/rooms/[code]/reset components/Podium.tsx app/room/[code]/page.tsx
git commit -m "feat: add play-again reset route and end-game podium with confetti"
```

---

### Task 17: Presence (RTDB) and connected-status mirroring

**Files:**
- Create: `lib/firebase/presence.ts`
- Create: `hooks/usePresenceSync.ts`
- Create: `app/api/rooms/[code]/presence/route.ts`
- Modify: `app/room/[code]/page.tsx` (register presence + start sync)

**Interfaces:**
- Consumes: `rtdb` (Task 7), `adminRtdb`/`adminDb` (Task 7), `presenceSchema` (Task 5)
- Produces: `registerPresence(roomCode, playerId): () => void`, `usePresenceSync(roomCode, playerId)` — wired into the room page.

- [ ] **Step 1: Write the client presence registration helper**

```ts
// lib/firebase/presence.ts
import { onDisconnect, onValue, ref, serverTimestamp, set } from "firebase/database";
import { rtdb } from "./client";

export function registerPresence(roomCode: string, playerId: string): () => void {
  const presenceRef = ref(rtdb, `presence/${roomCode}/${playerId}`);
  const connectedRef = ref(rtdb, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(presenceRef)
      .set({ online: false, lastSeen: serverTimestamp() })
      .then(() => {
        set(presenceRef, { online: true, lastSeen: serverTimestamp() });
      });
  });

  return () => unsubscribe();
}
```

- [ ] **Step 2: Write the presence-mirroring API route**

```ts
// app/api/rooms/[code]/presence/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminRtdb } from "@/lib/firebase/admin";
import { presenceSchema } from "@/lib/game/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const roomCode = code.toUpperCase();
  const body = await request.json();
  const parsed = presenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const presenceSnap = await adminRtdb
    .ref(`presence/${roomCode}/${parsed.data.playerId}`)
    .get();
  const online = presenceSnap.exists() ? presenceSnap.val().online === true : false;

  const playerRef = adminDb
    .collection("rooms")
    .doc(roomCode)
    .collection("players")
    .doc(parsed.data.playerId);

  await playerRef.update({ connected: online });

  return NextResponse.json({ ok: true, connected: online });
}
```

- [ ] **Step 3: Write the client-side sync hook**

```ts
// hooks/usePresenceSync.ts
"use client";

import { useEffect } from "react";

export function usePresenceSync(roomCode: string, playerId: string | null) {
  useEffect(() => {
    if (!playerId) return;

    const sync = () => {
      fetch(`/api/rooms/${roomCode}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      }).catch(() => {});
    };

    sync();
    const interval = setInterval(sync, 5000);
    return () => clearInterval(interval);
  }, [roomCode, playerId]);
}
```

- [ ] **Step 4: Wire presence into the room page**

Add these imports to `app/room/[code]/page.tsx`:

```ts
import { usePresenceSync } from "@/hooks/usePresenceSync";
import { registerPresence } from "@/lib/firebase/presence";
```

Add these two effects near the other hooks (after `myPlayerId` state is set up):

```ts
usePresenceSync(roomCode, myPlayerId ?? null);

useEffect(() => {
  if (!myPlayerId) return;
  return registerPresence(roomCode, myPlayerId);
}, [roomCode, myPlayerId]);
```

- [ ] **Step 5: Verify manually**

With two players in a room, close one browser tab entirely (not just navigate away) and wait ~10 seconds. Check the Firebase Console RTDB `presence/<code>/<playerId>` path — `online` should flip to `false` (this is `onDisconnect` firing). Then check Firestore `rooms/<code>/players/<playerId>` — `connected` should also flip to `false` within ~5 seconds (the next `usePresenceSync` poll from the remaining tab, or the closed tab's own poll before it fully disconnected — confirm at least one of the two paths reflects the disconnect within 10s of closing the tab).

- [ ] **Step 6: Commit**

```bash
git add lib/firebase/presence.ts hooks/usePresenceSync.ts app/api/rooms/[code]/presence app/room/[code]/page.tsx
git commit -m "feat: add RTDB presence tracking and Firestore connected-status mirroring"
```

---

### Task 18: Full end-to-end verification pass

**Files:** none created — this task verifies the assembled system and fixes any issues found in place.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: all tests from Tasks 2–6 pass (room-code, tiles, scoring, validation, word-select).

- [ ] **Step 2: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: no errors across the whole project.

- [ ] **Step 3: Run a full 3-player game manually**

Start `npm run dev`. Open three browser contexts (e.g. one normal window, one incognito, one different browser) so each gets independent `localStorage`. Create a room in the first, join with the other two, set `roundCount: 2` and `roundDurationMs: 20000` in the lobby for a fast test, start the game, and play both rounds to completion — mix outcomes (one player solves quickly, one runs out the clock, one uses all 6 guesses without solving) to exercise every finalization path (`allPlayersDone` and the timer-driven `/round/check`). Confirm:
- Tile colors are correct for at least one duplicate-letter guess
- The on-screen keyboard reflects best-known letter state
- Invalid words shake the board and don't consume an attempt
- The leaderboard is absent (or unchanged) during `in_round` and only reveals/reorders at `round_end`
- The podium shows correct final rankings with confetti for 1st
- "Play Again" resets scores and returns to the lobby with the same 3 players

- [ ] **Step 4: Verify mobile responsiveness**

Using the browser devtools device toolbar, set viewport width to 360px and repeat the core flow (join, play one round). Confirm no horizontal scroll and all tap targets remain usable.

- [ ] **Step 5: Verify rate limiting**

From the browser devtools console during an active round, fire two guess submissions to `/api/rooms/<code>/guess` back-to-back (under 400ms apart) using `fetch` directly with the same valid word. Confirm the second returns HTTP 429.

- [ ] **Step 6: Fix any issues found, then commit**

If any of the above surfaced a bug, fix it in the relevant file from the task that created it, re-run the affected verification step, and commit the fix separately:

```bash
git add -A
git commit -m "fix: address issues found in end-to-end verification"
```

If nothing needed fixing, no commit is needed for this task.

---

## Implementation deviations from this plan

- **`lib/player-session.ts` / room page (Tasks 8, 11):** Next.js 16 ships `eslint-plugin-react-hooks@7`, which added a `react-hooks/set-state-in-effect` rule that errors on the `useEffect(() => setState(getPlayerId(roomCode)), [roomCode])` pattern shown in this plan. Actual implementation replaced it with a `usePlayerId(roomCode)` hook built on `useSyncExternalStore` (React's sanctioned way to read a synchronous browser-only store without an effect-driven `setState`), with `savePlayerId`/`clearPlayerId` dispatching a custom event so same-tab updates re-trigger the subscription. The room page's `JoinInline onJoined` callback simplified to just `savePlayerId(roomCode, id)` since the hook picks up the change automatically.
- **`hooks/useRoundSubscription.ts` / `hooks/useMyGuessSubscription.ts` (Task 14):** dropped the early `setState(null)` calls in the disabled-guard branch (same lint rule) — harmless no-op since `useState`'s initial value is already `null`, and stale state from a prior round is never rendered because consumers gate on `room.status` in addition to the subscribed value.

## Post-plan notes (do not implement — informational)

- Deploying security rules to Firebase requires `firebase deploy --only firestore:rules,database` via the Firebase CLI, which is outside this plan's scope (it assumes local dev against the existing project). Tell the user to run this themselves before going to production, since an un-deployed `firestore.rules` file has no effect on the live project.
- Vercel deployment requires setting all `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_SERVICE_ACCOUNT_KEY` values as Vercel project environment variables — not covered by this plan.
