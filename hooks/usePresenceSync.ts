"use client";

import { useEffect } from "react";

const INITIAL_SYNC_DELAY_MS = 3000;

export function usePresenceSync(roomCode: string, playerId: string | null) {
  useEffect(() => {
    if (!playerId) return;

    const sync = () => {
      fetch(`/api/rooms/${roomCode}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      }).catch(() => {});
    };

    // Delay the first sync so it doesn't race registerPresence's RTDB
    // ".info/connected" handshake, which can still be in flight on mount —
    // polling too early would read "no presence yet" and briefly report
    // this player as disconnected to everyone in the room, themselves included.
    const initialTimeout = setTimeout(sync, INITIAL_SYNC_DELAY_MS);
    const interval = setInterval(sync, 5000);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [roomCode, playerId]);
}
