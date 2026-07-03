"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc } from "@/lib/game/types";

interface PodiumProps {
  players: PlayerWithId[];
  isHost: boolean;
  onPlayAgain: () => void;
  resetting: boolean;
  secretWord: string;
  guessesByPlayer: Record<string, GuessDoc>;
}

const PLACE_COLORS: Record<number, string> = {
  1: "bg-accent-secondary",
  2: "bg-accent-tertiary",
  3: "bg-accent-quaternary",
};
const PLACE_HEIGHTS: Record<number, string> = {
  1: "h-32",
  2: "h-24",
  3: "h-16",
};

export function Podium({
  players,
  isHost,
  onPlayAgain,
  resetting,
  secretWord,
  guessesByPlayer,
}: PodiumProps) {
  const ranked = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const [first, second, third] = ranked;

  const firstPlaceId = first?.id;
  useEffect(() => {
    if (!firstPlaceId) return;
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
  }, [firstPlaceId]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="border-4 border-black bg-accent-blue p-4 text-center text-white shadow-(--shadow-brutal-lg)">
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">The word was</p>
        <p className="font-(--font-display) text-4xl uppercase tracking-widest">{secretWord}</p>
      </div>
      <h2 className="font-(--font-display) text-3xl uppercase">
        <span className="text-accent-primary">Final</span> Results
      </h2>
      <div className="flex w-full items-end justify-center gap-3">
        {second && <PodiumSpot player={second} place={2} />}
        {first && <PodiumSpot player={first} place={1} />}
        {third && <PodiumSpot player={third} place={3} />}
      </div>
      <ul className="w-full">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className="flex justify-between border-b-2 border-black py-2 text-sm font-bold"
          >
            <span>
              {i + 1}. {p.nickname}
              {guessesByPlayer[p.id]?.solved && (
                <span className="ml-2 text-xs uppercase text-tile-correct">solved</span>
              )}
            </span>
            <span className="font-(--font-display) text-lg">{p.totalScore}</span>
          </li>
        ))}
      </ul>
      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={resetting}
          className="border-4 border-black bg-accent-primary px-4 py-3 font-(--font-display) uppercase tracking-wide text-white shadow-(--shadow-brutal) transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
        >
          {resetting ? "Resetting..." : "Play Again"}
        </button>
      )}
    </div>
  );
}

function PodiumSpot({ player, place }: { player: PlayerWithId; place: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm font-bold">{player.nickname}</span>
      <div
        className={`flex w-20 items-start justify-center border-4 border-black pt-2 font-(--font-display) text-2xl shadow-[3px_3px_0_#000] ${PLACE_HEIGHTS[place]} ${PLACE_COLORS[place]}`}
      >
        {place}
      </div>
    </div>
  );
}
