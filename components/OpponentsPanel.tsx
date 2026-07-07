"use client";

import { motion } from "framer-motion";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc, TileColor } from "@/lib/game/types";

interface OpponentsPanelProps {
  players: PlayerWithId[];
  myPlayerId: string;
  guessesByPlayer: Record<string, GuessDoc>;
}

const TILE_DOT_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct",
  yellow: "bg-tile-present",
  gray: "bg-tile-absent",
};

export function OpponentsPanel({ players, myPlayerId, guessesByPlayer }: OpponentsPanelProps) {
  const opponents = players.filter((p) => p.id !== myPlayerId);

  if (opponents.length === 0) return null;

  return (
    <div className="hidden w-56 flex-col gap-3 lg:flex">
      <p className="text-xs font-bold uppercase tracking-widest text-ink/60">Opponents</p>
      {opponents.map((player) => {
        const guess = guessesByPlayer[player.id];
        const lastAttempt = guess?.attempts[guess.attempts.length - 1];
        const tiles = lastAttempt?.tiles ?? [];

        return (
          <motion.div
            key={player.id}
            layout
            className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 shadow-(--shadow-clay-sm)"
          >
            <span className="truncate text-sm font-bold">{player.nickname}</span>
            <span className="flex shrink-0 items-center gap-1">
              {guess?.solved ? (
                <span className="rounded-full bg-tile-correct px-2 py-0.5 text-[10px] font-black uppercase text-white">
                  Solved
                </span>
              ) : (
                Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full ${tiles[i] ? TILE_DOT_COLORS[tiles[i]] : "bg-surface shadow-(--shadow-clay-pressed)"}`}
                  />
                ))
              )}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
