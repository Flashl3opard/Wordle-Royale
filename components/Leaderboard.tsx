"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PlayerWithId } from "@/store/useRoomStore";

interface LeaderboardProps {
  players: PlayerWithId[];
  pointsThisRound?: Record<string, number>;
}

export function Leaderboard({ players, pointsThisRound }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <ul className="flex w-full flex-col gap-2">
      <AnimatePresence>
        {sorted.map((player, index) => (
          <motion.li
            key={player.id}
            layout
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2 font-bold shadow-(--shadow-clay-sm)"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-sm text-gray-500">#{index + 1}</span>
              <span className="truncate">{player.nickname}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {pointsThisRound?.[player.id] != null && (
                <span className="text-xs font-black text-tile-correct">+{pointsThisRound[player.id]}</span>
              )}
              <span className="font-display text-lg">{player.totalScore}</span>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
