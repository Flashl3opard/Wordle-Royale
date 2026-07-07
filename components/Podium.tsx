"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc } from "@/lib/game/types";
import { BackgroundFX } from "./BackgroundFX";

interface PodiumProps {
  players: PlayerWithId[];
  isHost: boolean;
  onPlayAgain: () => void;
  resetting: boolean;
  secretWord: string;
  guessesByPlayer: Record<string, GuessDoc>;
  roundStartedAt: number;
}

interface RankedPlayer {
  player: PlayerWithId;
  solved: boolean;
  attempts: number;
  timeMs: number | null;
}

function buildRanking(
  players: PlayerWithId[],
  guessesByPlayer: Record<string, GuessDoc>,
  roundStartedAt: number
): RankedPlayer[] {
  const withStats: RankedPlayer[] = players.map((player) => {
    const guess = guessesByPlayer[player.id];
    const attempts = guess?.attempts.length ?? 0;
    const solved = guess?.solved ?? false;
    const lastAttempt = guess?.attempts[guess.attempts.length - 1];
    const timeMs = solved && lastAttempt ? lastAttempt.submittedAt - roundStartedAt : null;
    return { player, solved, attempts, timeMs };
  });

  return withStats.sort((a, b) => {
    if (b.player.totalScore !== a.player.totalScore) {
      return b.player.totalScore - a.player.totalScore;
    }
    if (a.timeMs !== null && b.timeMs !== null) return a.timeMs - b.timeMs;
    if (a.timeMs !== null) return -1;
    if (b.timeMs !== null) return 1;
    return 0;
  });
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function Podium({
  players,
  isHost,
  onPlayAgain,
  resetting,
  secretWord,
  guessesByPlayer,
  roundStartedAt,
}: PodiumProps) {
  const ranked = useMemo(
    () => buildRanking(players, guessesByPlayer, roundStartedAt),
    [players, guessesByPlayer, roundStartedAt]
  );

  const fastestSolveId = useMemo(() => {
    const solved = ranked.filter((r) => r.timeMs !== null);
    if (solved.length === 0) return null;
    return solved.reduce((fastest, r) => (r.timeMs! < fastest.timeMs! ? r : fastest)).player.id;
  }, [ranked]);

  const firstPlaceId = ranked[0]?.player.id;
  useEffect(() => {
    if (!firstPlaceId) return;
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    const interval = setInterval(() => {
      confetti({ particleCount: 40, spread: 60, origin: { x: Math.random(), y: 0.3 } });
    }, 700);
    const stop = setTimeout(() => clearInterval(interval), 2800);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [firstPlaceId]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <BackgroundFX intensity="max" />
      <div className="relative z-10 flex w-full flex-col items-center gap-6">
        <div className="rounded-[var(--radius-clay)] bg-accent-blue p-4 text-center text-white shadow-(--shadow-clay-lg)">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">The word was</p>
          <p className="font-display text-3xl uppercase tracking-widest sm:text-4xl">{secretWord}</p>
        </div>
        <h2 className="font-display text-3xl uppercase">
          <span className="text-accent-primary">Final</span> Results
        </h2>
        <ul className="flex w-full flex-col gap-2">
          {ranked.map((r, i) => (
            <motion.li
              key={r.player.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: i * 0.08 }}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 shadow-(--shadow-clay-sm)"
            >
              <span className="flex min-w-0 items-center gap-2 font-bold">
                <span className="font-display text-lg text-accent-primary">{i + 1}</span>
                <span className="truncate">{r.player.nickname}</span>
                {r.player.id === fastestSolveId && (
                  <span className="shrink-0 rounded-full bg-accent-secondary px-2 py-0.5 text-[10px] font-black uppercase">
                    ⚡ Fastest
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm">
                <span className="text-ink/60">
                  {r.solved ? `${r.attempts} ${r.attempts === 1 ? "try" : "tries"} · ${formatTime(r.timeMs!)}` : "Out of guesses"}
                </span>
                <span className="font-display text-lg">{r.player.totalScore}</span>
              </span>
            </motion.li>
          ))}
        </ul>
        {isHost && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onPlayAgain}
            disabled={resetting}
            className="rounded-2xl bg-accent-primary px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
          >
            {resetting ? "Resetting..." : "Play Again"}
          </motion.button>
        )}
      </div>
    </div>
  );
}
