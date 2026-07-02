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
