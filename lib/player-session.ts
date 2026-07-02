const STORAGE_PREFIX = "wordle-arena:";

export function savePlayerId(roomCode: string, playerId: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}${roomCode}`, playerId);
}

export function getPlayerId(roomCode: string): string | null {
  return localStorage.getItem(`${STORAGE_PREFIX}${roomCode}`);
}

export function clearPlayerId(roomCode: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${roomCode}`);
}
