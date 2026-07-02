"use client";

import { useSyncExternalStore } from "react";

const STORAGE_PREFIX = "wordle-arena:";
const CHANGE_EVENT = "wordle-arena:player-session-changed";

export function savePlayerId(roomCode: string, playerId: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}${roomCode}`, playerId);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getPlayerId(roomCode: string): string | null {
  return localStorage.getItem(`${STORAGE_PREFIX}${roomCode}`);
}

export function clearPlayerId(roomCode: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${roomCode}`);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// Reads localStorage without triggering the react-hooks/set-state-in-effect
// rule: localStorage isn't available during SSR, so this can't be computed
// during render directly. useSyncExternalStore is React's sanctioned way to
// read a synchronous external browser store without effect-driven setState.
export function usePlayerId(roomCode: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getPlayerId(roomCode),
    () => undefined
  );
}
