"use client";

import { Leaderboard } from "./Leaderboard";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GuessDoc, RoundDoc } from "@/lib/game/types";

interface RoundEndProps {
  round: RoundDoc;
  players: PlayerWithId[];
  guessesByPlayer: Record<string, GuessDoc>;
  isHost: boolean;
  isFinalRound: boolean;
  onNext: () => void;
  advancing: boolean;
}

export function RoundEnd({
  round,
  players,
  guessesByPlayer,
  isHost,
  isFinalRound,
  onNext,
  advancing,
}: RoundEndProps) {
  const pointsThisRound: Record<string, number> = {};
  for (const player of players) {
    pointsThisRound[player.id] = guessesByPlayer[player.id]?.totalPointsThisRound ?? 0;
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-gray-500">The word was</p>
        <p className="text-3xl font-bold uppercase tracking-widest">{round.secretWord}</p>
      </div>
      <Leaderboard players={players} pointsThisRound={pointsThisRound} />
      {isHost && (
        <button
          onClick={onNext}
          disabled={advancing}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {advancing ? "Loading..." : isFinalRound ? "See Final Results" : "Next Round"}
        </button>
      )}
    </div>
  );
}
