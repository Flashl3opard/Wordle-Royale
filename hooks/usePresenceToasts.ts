"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";

export interface ToastMessage {
  id: string;
  text: string;
  kind: "left" | "rejoined";
}

const TOAST_LIFETIME_MS = 4000;
const DISCONNECT_GRACE_MS = 3000;

export function usePresenceToasts(players: PlayerWithId[]): ToastMessage[] {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const previousConnected = useRef<Map<string, boolean> | null>(null);
  const pendingLeftTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const current = new Map(players.map((p) => [p.id, p.connected]));

    if (previousConnected.current === null) {
      previousConnected.current = current;
      return;
    }

    const prev = previousConnected.current;

    for (const player of players) {
      const wasConnected = prev.get(player.id);
      if (wasConnected === undefined) continue;

      if (wasConnected && !player.connected) {
        const timer = setTimeout(() => {
          const toastId = `${player.id}-left-${Date.now()}`;
          setToasts((existing) => [
            ...existing,
            { id: toastId, text: `${player.nickname} left the room`, kind: "left" },
          ]);
          pendingLeftTimers.current.delete(player.id);
          setTimeout(() => {
            setToasts((existing) => existing.filter((t) => t.id !== toastId));
          }, TOAST_LIFETIME_MS);
        }, DISCONNECT_GRACE_MS);
        pendingLeftTimers.current.set(player.id, timer);
      } else if (!wasConnected && player.connected) {
        const pending = pendingLeftTimers.current.get(player.id);
        if (pending) {
          clearTimeout(pending);
          pendingLeftTimers.current.delete(player.id);
        } else {
          const toastId = `${player.id}-rejoined-${Date.now()}`;
          setToasts((existing) => [
            ...existing,
            { id: toastId, text: `${player.nickname} reconnected`, kind: "rejoined" },
          ]);
          setTimeout(() => {
            setToasts((existing) => existing.filter((t) => t.id !== toastId));
          }, TOAST_LIFETIME_MS);
        }
      }
    }

    previousConnected.current = current;
  }, [players]);

  return toasts;
}
