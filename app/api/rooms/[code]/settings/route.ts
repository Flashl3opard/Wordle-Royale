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
    mode: parsed.data.mode,
    ...(parsed.data.roundDurationMs !== undefined
      ? { roundDurationMs: parsed.data.roundDurationMs }
      : {}),
  });

  return NextResponse.json({ ok: true });
}
