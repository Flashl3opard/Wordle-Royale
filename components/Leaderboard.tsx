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
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm text-gray-400">#{index + 1}</span>
              {player.nickname}
            </span>
            <span className="flex items-center gap-2">
              {pointsThisRound?.[player.id] != null && (
                <span className="text-xs text-green-600">+{pointsThisRound[player.id]}</span>
              )}
              <span className="font-semibold">{player.totalScore}</span>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
