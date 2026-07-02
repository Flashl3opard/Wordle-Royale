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
