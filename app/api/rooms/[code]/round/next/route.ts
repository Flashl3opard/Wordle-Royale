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
