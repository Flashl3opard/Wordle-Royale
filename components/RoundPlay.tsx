"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GameBoard } from "./GameBoard";
import { Keyboard } from "./Keyboard";
import { Timer } from "./Timer";
import type { GuessDoc, RoundDoc } from "@/lib/game/types";

interface RoundPlayProps {
  roomCode: string;
  myPlayerId: string;
  round: RoundDoc;
  roundDurationMs: number;
  myGuess: GuessDoc | null;
}

export function RoundPlay({
  roomCode,
  myPlayerId,
  round,
  roundDurationMs,
  myGuess,
}: RoundPlayProps) {
  const [currentGuess, setCurrentGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const attempts = myGuess?.attempts ?? [];
  const solved = myGuess?.solved ?? false;
  const outOfAttempts = attempts.length >= 6;
  const canPlay = !solved && !outOfAttempts;

  async function submitGuess(word: string) {
    if (word.length !== 5 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: myPlayerId, word }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid guess");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      }
      setCurrentGuess("");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyPress(key: string) {
    if (!canPlay) return;
    if (key === "ENTER") {
      submitGuess(currentGuess);
      return;
    }
    if (key === "BACKSPACE") {
      setCurrentGuess((g) => g.slice(0, -1));
      return;
    }
    if (/^[A-Z]$/.test(key) && currentGuess.length < 5) {
      setCurrentGuess((g) => g + key);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") handleKeyPress("ENTER");
      else if (e.key === "Backspace") handleKeyPress("BACKSPACE");
      else if (/^[a-zA-Z]$/.test(e.key)) handleKeyPress(e.key.toUpperCase());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleTimerExpire() {
    await fetch(`/api/rooms/${roomCode}/round/check`, { method: "POST" });
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <Timer
        roundEndsAt={round.roundEndsAt}
        roundDurationMs={roundDurationMs}
        onExpire={handleTimerExpire}
      />
      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <GameBoard attempts={attempts} currentGuess={canPlay ? currentGuess : ""} />
      </motion.div>
      {solved && (
        <p className="border-4 border-black bg-tile-correct px-4 py-2 font-(--font-display) uppercase text-white shadow-(--shadow-brutal)">
          You solved it! Waiting for others...
        </p>
      )}
      {outOfAttempts && !solved && (
        <p className="border-4 border-black bg-white px-4 py-2 font-(--font-display) uppercase shadow-(--shadow-brutal)">
          Out of guesses. Waiting for others...
        </p>
      )}
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
      <Keyboard attempts={attempts} onKeyPress={handleKeyPress} disabled={!canPlay || submitting} />
    </div>
  );
}
