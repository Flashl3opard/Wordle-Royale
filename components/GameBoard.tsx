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
  green: "bg-tile-correct border-black text-white",
  yellow: "bg-tile-present border-black text-black",
  gray: "bg-tile-absent border-black text-white",
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
                  initial={{ rotateX: 0, scale: 1 }}
                  animate={{ rotateX: [0, 90, 0], scale: [1, 1.15, 1] }}
                  transition={{
                    duration: 0.5,
                    delay: colIndex * 0.15,
                    times: [0, 0.5, 1],
                    ease: ["easeIn", "backOut"],
                  }}
                  className={`flex h-12 w-12 items-center justify-center border-4 text-2xl font-black shadow-[3px_3px_0_#000] sm:h-14 sm:w-14 ${TILE_COLORS[color]}`}
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
                  className={`flex h-12 w-12 items-center justify-center border-4 text-2xl font-black sm:h-14 sm:w-14 ${
                    letter ? "border-black bg-accent-secondary/30" : "border-black"
                  }`}
                >
                  {letter}
                </div>
              );
            }
            return (
              <div
                key={colIndex}
                className="flex h-12 w-12 items-center justify-center border-4 border-gray-300 sm:h-14 sm:w-14"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
