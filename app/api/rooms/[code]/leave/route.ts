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
