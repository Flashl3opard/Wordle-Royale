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
