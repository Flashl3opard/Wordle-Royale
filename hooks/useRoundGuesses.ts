"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { GuessDoc } from "@/lib/game/types";

export function useRoundGuesses(
  roomCode: string,
  roundNumber: number,
  enabled: boolean
): Record<string, GuessDoc> {
  const [guesses, setGuesses] = useState<Record<string, GuessDoc>>({});

  useEffect(() => {
    if (!enabled || roundNumber < 1) {
      return;
    }
    const ref = collection(
      firestore,
      "rooms",
      roomCode,
      "rounds",
      String(roundNumber),
      "guesses"
    );
    const unsub = onSnapshot(ref, (snap) => {
      const map: Record<string, GuessDoc> = {};
      snap.forEach((d) => {
        map[d.id] = d.data() as GuessDoc;
      });
      setGuesses(map);
    });
    return () => unsub();
  }, [roomCode, roundNumber, enabled]);

  return guesses;
}
