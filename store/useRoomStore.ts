import { create } from "zustand";
import type { PlayerDoc, RoomDoc } from "@/lib/game/types";

export type PlayerWithId = PlayerDoc & { id: string };

interface RoomState {
  room: RoomDoc | null;
  players: PlayerWithId[];
  setRoom: (room: RoomDoc | null) => void;
  setPlayers: (players: PlayerWithId[]) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  players: [],
  setRoom: (room) => set({ room }),
  setPlayers: (players) => set({ players }),
}));
