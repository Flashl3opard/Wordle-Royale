import type { Firestore } from "firebase-admin/firestore";
import type { GuessDoc } from "./types";

export async function finalizeRoundIfNeeded(
  db: Firestore,
  roomCode: string,
  roundNumber: number
): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roundRef = roomRef.collection("rounds").doc(String(roundNumber));

  await db.runTransaction(async (tx) => {
    const roundSnap = await tx.get(roundRef);
    if (!roundSnap.exists) return;
    if (roundSnap.data()!.status === "ended") return;

    tx.update(roundRef, { status: "ended" });
    tx.update(roomRef, { status: "round_end" });
  });
}

export async function allPlayersDone(
  db: Firestore,
  roomCode: string,
  roundNumber: number
): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const playersSnap = await roomRef.collection("players").get();
  const guessesSnap = await roomRef
    .collection("rounds")
    .doc(String(roundNumber))
    .collection("guesses")
    .get();

  const guessesByPlayer = new Map<string, GuessDoc>(
    guessesSnap.docs.map((d) => [d.id, d.data() as GuessDoc])
  );

  return playersSnap.docs.every((playerDoc) => {
    const guess = guessesByPlayer.get(playerDoc.id);
    if (!guess) return false;
    return guess.solved === true || guess.attempts.length >= 6;
  });
}
