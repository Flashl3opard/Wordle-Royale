import { NextResponse } from "next/server";
import { adminDb, adminRtdb } from "@/lib/firebase/admin";
import { deleteRoomCascade, shouldDeleteRoom } from "@/lib/game/room-cleanup";
import type { PlayerDoc, RoomDoc } from "@/lib/game/types";

const DISCONNECTED_THRESHOLD_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const roomsSnap = await adminDb.collection("rooms").get();
  let deletedCount = 0;

  for (const roomDoc of roomsSnap.docs) {
    const room = roomDoc.data() as RoomDoc;
    const playersSnap = await roomDoc.ref.collection("players").get();
    const players = playersSnap.docs.map((p) => p.data() as PlayerDoc);

    if (room.expiresAt < now) {
      await deleteRoomCascade(adminDb, roomDoc.id);
      deletedCount++;
      continue;
    }

    if (players.length === 0) {
      await deleteRoomCascade(adminDb, roomDoc.id);
      deletedCount++;
      continue;
    }

    const allDisconnected = players.every((p) => !p.connected);
    if (!allDisconnected) continue;

    const lastSeenTimestamps = await Promise.all(
      playersSnap.docs.map(async (p) => {
        const snap = await adminRtdb.ref(`presence/${roomDoc.id}/${p.id}`).get();
        const lastSeen = snap.exists() ? (snap.val().lastSeen as number | undefined) : undefined;
        return lastSeen ?? 0;
      })
    );
    const mostRecentDisconnect = Math.max(...lastSeenTimestamps, 0);

    if (now - mostRecentDisconnect >= DISCONNECTED_THRESHOLD_MS) {
      if (shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)) {
        await deleteRoomCascade(adminDb, roomDoc.id);
        deletedCount++;
      }
    }
  }

  return NextResponse.json({ ok: true, deletedCount });
}
