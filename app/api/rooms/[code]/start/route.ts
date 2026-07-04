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
