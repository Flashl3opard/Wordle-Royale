"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { RoundDoc } from "@/lib/game/types";

export function useRoundSubscription(roomCode: string, roundNumber: number) {
  const [round, setRound] = useState<RoundDoc | null>(null);

  useEffect(() => {
    if (roundNumber < 1) {
      return;
    }
    const ref = doc(firestore, "rooms", roomCode, "rounds", String(roundNumber));
    const unsub = onSnapshot(ref, (snap) => {
      setRound(snap.exists() ? (snap.data() as RoundDoc) : null);
    });
    return () => unsub();
  }, [roomCode, roundNumber]);

  return round;
}
