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
