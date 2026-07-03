"use client";

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
            <button
              disabled={disabled}
              onClick={() => onKeyPress("ENTER")}
              className="border-4 border-black bg-white px-3 py-3 text-xs font-black uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
            >
              Enter
            </button>
          )}
          {row.split("").map((letter) => (
            <button
              key={letter}
              disabled={disabled}
              onClick={() => onKeyPress(letter)}
              className={`border-4 border-black px-2.5 py-3 text-sm font-black shadow-[2px_2px_0_#000] disabled:opacity-50 ${
                keyStates[letter] ? KEY_COLORS[keyStates[letter]] : "bg-white"
              }`}
            >
              {letter}
            </button>
          ))}
          {rowIndex === 2 && (
            <button
              disabled={disabled}
              onClick={() => onKeyPress("BACKSPACE")}
              className="border-4 border-black bg-white px-3 py-3 text-xs font-black uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
            >
              Del
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
