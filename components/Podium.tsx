"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import type { PlayerWithId } from "@/store/useRoomStore";

interface PodiumProps {
  players: PlayerWithId[];
  isHost: boolean;
  onPlayAgain: () => void;
  resetting: boolean;
}

const PLACE_COLORS: Record<number, string> = {
  1: "bg-yellow-400",
  2: "bg-gray-300",
  3: "bg-orange-300",
};
const PLACE_HEIGHTS: Record<number, string> = {
  1: "h-32",
  2: "h-24",
  3: "h-16",
};

export function Podium({ players, isHost, onPlayAgain, resetting }: PodiumProps) {
  const ranked = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const [first, second, third] = ranked;

  const firstPlaceId = first?.id;
  useEffect(() => {
    if (!firstPlaceId) return;
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
  }, [firstPlaceId]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <h2 className="text-2xl font-bold">Final Results</h2>
      <div className="flex w-full items-end justify-center gap-3">
        {second && <PodiumSpot player={second} place={2} />}
        {first && <PodiumSpot player={first} place={1} />}
        {third && <PodiumSpot player={third} place={3} />}
      </div>
      <ul className="w-full">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between border-b border-gray-100 py-1 text-sm">
            <span>
              {i + 1}. {p.nickname}
            </span>
            <span className="font-semibold">{p.totalScore}</span>
          </li>
        ))}
      </ul>
      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={resetting}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
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
      <span className="text-sm font-semibold">{player.nickname}</span>
      <div
        className={`flex w-20 items-start justify-center rounded-t pt-2 text-xl font-bold ${PLACE_HEIGHTS[place]} ${PLACE_COLORS[place]}`}
      >
        {place}
      </div>
    </div>
  );
}
