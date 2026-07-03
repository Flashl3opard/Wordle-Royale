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

  const roundNumber = 1;
  const roundRef = roomRef.collection("rounds").doc(String(roundNumber));
  const roundSnap = await roundRef.get();
  if (!roundSnap.exists || (roundSnap.data() as RoundDoc).status !== "active") {
    return NextResponse.json({ error: "Round is not active" }, { status: 409 });
  }
  const round = roundSnap.data() as RoundDoc;
  if (round.roundEndsAt !== null && now >= round.roundEndsAt) {
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
  const timeRemainingMs = round.roundEndsAt !== null ? Math.max(0, round.roundEndsAt - now) : null;
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
