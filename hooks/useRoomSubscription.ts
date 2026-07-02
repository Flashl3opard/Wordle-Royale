"use client";

import { useEffect } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { useRoomStore } from "@/store/useRoomStore";
import type { PlayerDoc, RoomDoc } from "@/lib/game/types";

export function useRoomSubscription(roomCode: string) {
  const setRoom = useRoomStore((s) => s.setRoom);
  const setPlayers = useRoomStore((s) => s.setPlayers);

  useEffect(() => {
    const roomRef = doc(firestore, "rooms", roomCode);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      setRoom(snap.exists() ? (snap.data() as RoomDoc) : null);
    });

    const playersRef = collection(firestore, "rooms", roomCode, "players");
    const unsubPlayers = onSnapshot(playersRef, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PlayerDoc) })));
    });

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomCode, setRoom, setPlayers]);
}
