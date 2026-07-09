import type { Firestore } from "firebase-admin/firestore";

export function shouldDeleteRoom(
  room: { expiresAt: number },
  players: Array<{ connected: boolean }>,
  now: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site explicitness; the elapsed-time gate is enforced by the caller before invoking this predicate
  disconnectedThresholdMs: number
): boolean {
  if (room.expiresAt < now) return true;
  if (players.length === 0) return true;
  if (players.every((p) => !p.connected)) return true;
  return false;
}

export async function deleteRoomCascade(db: Firestore, roomCode: string): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);

  const roundsSnap = await roomRef.collection("rounds").get();
  await Promise.all(
    roundsSnap.docs.map(async (roundDoc) => {
      const guessesSnap = await roundDoc.ref.collection("guesses").get();
      await Promise.all(guessesSnap.docs.map((g) => g.ref.delete()));
      await roundDoc.ref.delete();
    })
  );

  const playersSnap = await roomRef.collection("players").get();
  await Promise.all(playersSnap.docs.map((p) => p.ref.delete()));

  await roomRef.delete();
}
