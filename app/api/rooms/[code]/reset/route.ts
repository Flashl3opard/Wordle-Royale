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

  await roomRef.update({ status: "lobby" });

  return NextResponse.json({ ok: true });
}
