"use client";

import { useEffect } from "react";

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

    sync();
    const interval = setInterval(sync, 5000);
    return () => clearInterval(interval);
  }, [roomCode, playerId]);
}
