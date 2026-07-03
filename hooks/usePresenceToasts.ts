"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";

export interface ToastMessage {
  id: string;
  text: string;
  kind: "left" | "rejoined";
}

const TOAST_LIFETIME_MS = 4000;

export function usePresenceToasts(players: PlayerWithId[]): ToastMessage[] {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const previousConnected = useRef<Map<string, boolean> | null>(null);

  useEffect(() => {
    const current = new Map(players.map((p) => [p.id, p.connected]));

    if (previousConnected.current === null) {
      previousConnected.current = current;
      return;
    }

    const prev = previousConnected.current;
    const newToasts: ToastMessage[] = [];

    for (const player of players) {
      const wasConnected = prev.get(player.id);
      if (wasConnected === undefined) continue;
      if (wasConnected && !player.connected) {
        newToasts.push({
          id: `${player.id}-left-${Date.now()}`,
          text: `${player.nickname} left the room`,
          kind: "left",
        });
      } else if (!wasConnected && player.connected) {
        newToasts.push({
          id: `${player.id}-rejoined-${Date.now()}`,
          text: `${player.nickname} reconnected`,
          kind: "rejoined",
        });
      }
    }

    previousConnected.current = current;

    if (newToasts.length > 0) {
      setToasts((existing) => [...existing, ...newToasts]);
      for (const toast of newToasts) {
        setTimeout(() => {
          setToasts((existing) => existing.filter((t) => t.id !== toast.id));
        }, TOAST_LIFETIME_MS);
      }
    }
  }, [players]);

  return toasts;
}
