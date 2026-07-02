"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";

interface GameBoardProps {
  attempts: GuessAttempt[];
  currentGuess: string;
  maxAttempts?: number;
  wordLength?: number;
}

const TILE_COLORS: Record<TileColor, string> = {
  green: "bg-green-600 border-green-600 text-white",
  yellow: "bg-yellow-500 border-yellow-500 text-white",
  gray: "bg-gray-500 border-gray-500 text-white",
};

type Row =
  | { kind: "submitted"; attempt: GuessAttempt }
  | { kind: "current" }
  | { kind: "empty" };

export function GameBoard({
  attempts,
  currentGuess,
  maxAttempts = 6,
  wordLength = 5,
}: GameBoardProps) {
  const rows: Row[] = Array.from({ length: maxAttempts }, (_, rowIndex) => {
    if (rowIndex < attempts.length) return { kind: "submitted", attempt: attempts[rowIndex] };
    if (rowIndex === attempts.length) return { kind: "current" };
    return { kind: "empty" };
  });

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {Array.from({ length: wordLength }, (_, colIndex) => {
            if (row.kind === "submitted") {
              const letter = row.attempt.word[colIndex]?.toUpperCase() ?? "";
              const color = row.attempt.tiles[colIndex];
              return (
                <motion.div
                  key={colIndex}
                  initial={{ rotateX: 0 }}
                  animate={{ rotateX: [0, 90, 0] }}
                  transition={{ duration: 0.5, delay: colIndex * 0.15 }}
                  className={`flex h-12 w-12 items-center justify-center rounded border-2 text-2xl font-bold sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
                >
                  {letter}
                </motion.div>
              );
            }
            if (row.kind === "current") {
              const letter = currentGuess[colIndex]?.toUpperCase() ?? "";
              return (
                <div
                  key={colIndex}
                  className="flex h-12 w-12 items-center justify-center rounded border-2 border-gray-400 text-2xl font-bold sm:h-14 sm:w-14"
                >
                  {letter}
                </div>
              );
            }
            return (
              <div
                key={colIndex}
                className="flex h-12 w-12 items-center justify-center rounded border-2 border-gray-200 sm:h-14 sm:w-14"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
