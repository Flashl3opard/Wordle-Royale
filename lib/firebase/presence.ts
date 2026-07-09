import { onDisconnect, onValue, ref, serverTimestamp, set } from "firebase/database";
import { rtdb } from "./client";

export function registerPresence(roomCode: string, playerId: string): () => void {
  const presenceRef = ref(rtdb, `presence/${roomCode}/${playerId}`);
  const connectedRef = ref(rtdb, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return;
    set(presenceRef, { online: true, lastSeen: serverTimestamp() });
    onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() });
  });

  return () => unsubscribe();
}
