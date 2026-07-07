"use client";

import { motion } from "framer-motion";
import type { GuessAttempt, TileColor } from "@/lib/game/types";

interface KeyboardProps {
  attempts: GuessAttempt[];
  onKeyPress: (key: string) => void;
  disabled?: boolean;
}

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const COLOR_PRIORITY: Record<TileColor, number> = { gray: 0, yellow: 1, green: 2 };

function computeKeyStates(attempts: GuessAttempt[]): Record<string, TileColor> {
  const states: Record<string, TileColor> = {};
  for (const attempt of attempts) {
    for (let i = 0; i < attempt.word.length; i++) {
      const letter = attempt.word[i].toUpperCase();
      const color = attempt.tiles[i];
      const current = states[letter];
      if (!current || COLOR_PRIORITY[color] > COLOR_PRIORITY[current]) {
        states[letter] = color;
      }
    }
  }
  return states;
}

const KEY_COLORS: Record<TileColor, string> = {
  green: "bg-tile-correct text-white",
  yellow: "bg-tile-present text-black",
  gray: "bg-tile-absent text-white",
};

export function Keyboard({ attempts, onKeyPress, disabled }: KeyboardProps) {
  const keyStates = computeKeyStates(attempts);

  return (
    <div className="flex flex-col gap-1.5">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1">
          {rowIndex === 2 && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress("ENTER")}
              className="rounded-lg bg-white px-2 py-3 text-xs font-black uppercase shadow-(--shadow-clay-sm) disabled:opacity-50 sm:px-3"
            >
              Enter
            </motion.button>
          )}
          {row.split("").map((letter) => (
            <motion.button
              key={letter}
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress(letter)}
              className={`rounded-lg px-2 py-3 text-sm font-black shadow-(--shadow-clay-sm) disabled:opacity-50 sm:px-2.5 ${
                keyStates[letter] ? KEY_COLORS[keyStates[letter]] : "bg-white"
              }`}
            >
              {letter}
            </motion.button>
          ))}
          {rowIndex === 2 && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              disabled={disabled}
              onClick={() => onKeyPress("BACKSPACE")}
              className="rounded-lg bg-white px-2 py-3 text-xs font-black uppercase shadow-(--shadow-clay-sm) disabled:opacity-50 sm:px-3"
            >
              Del
            </motion.button>
          )}
        </div>
      ))}
    </div>
  );
}
