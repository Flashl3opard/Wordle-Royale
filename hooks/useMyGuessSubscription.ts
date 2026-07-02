"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { GuessDoc } from "@/lib/game/types";

export function useMyGuessSubscription(
  roomCode: string,
  roundNumber: number,
  playerId: string | null
) {
  const [guess, setGuess] = useState<GuessDoc | null>(null);

  useEffect(() => {
    if (!playerId || roundNumber < 1) {
      return;
    }
    const ref = doc(
      firestore,
      "rooms",
      roomCode,
      "rounds",
      String(roundNumber),
      "guesses",
      playerId
    );
    const unsub = onSnapshot(ref, (snap) => {
      setGuess(snap.exists() ? (snap.data() as GuessDoc) : null);
    });
    return () => unsub();
  }, [roomCode, roundNumber, playerId]);

  return guess;
}
