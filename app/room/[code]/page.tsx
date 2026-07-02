"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearPlayerId, savePlayerId, usePlayerId } from "@/lib/player-session";
import { useRoomStore } from "@/store/useRoomStore";
import { useRoomSubscription } from "@/hooks/useRoomSubscription";
import { useRoundSubscription } from "@/hooks/useRoundSubscription";
import { useMyGuessSubscription } from "@/hooks/useMyGuessSubscription";
import { useRoundGuesses } from "@/hooks/useRoundGuesses";
import { Lobby } from "@/components/Lobby";
import { JoinInline } from "@/components/JoinInline";
import { RoundPlay } from "@/components/RoundPlay";
import { RoundEnd } from "@/components/RoundEnd";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = params.code.toUpperCase();

  const myPlayerId = usePlayerId(roomCode);

  useRoomSubscription(roomCode);
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);

  const round = useRoundSubscription(roomCode, room?.currentRound ?? 0);
  const myGuess = useMyGuessSubscription(roomCode, room?.currentRound ?? 0, myPlayerId ?? null);
  const guessesByPlayer = useRoundGuesses(
    roomCode,
    room?.currentRound ?? 0,
    room?.status === "round_end" || room?.status === "finished"
  );

  const [advancing, setAdvancing] = useState(false);

  function handleLeave() {
    clearPlayerId(roomCode);
    router.push("/");
  }

  async function handleNextRound() {
    if (!myPlayerId) return;
    setAdvancing(true);
    await fetch(`/api/rooms/${roomCode}/round/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    setAdvancing(false);
  }

  if (myPlayerId === undefined || (myPlayerId && !room)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!myPlayerId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <JoinInline
          roomCode={roomCode}
          onJoined={(id) => savePlayerId(roomCode, id)}
        />
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-lg text-gray-600">Room not found. It may have expired.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6">
      {room.status === "lobby" && (
        <Lobby
          room={room}
          players={players}
          myPlayerId={myPlayerId}
          roomCode={roomCode}
          onLeave={handleLeave}
        />
      )}
      {room.status === "in_round" && round && (
        <RoundPlay
          roomCode={roomCode}
          myPlayerId={myPlayerId}
          round={round}
          roundDurationMs={room.roundDurationMs}
          myGuess={myGuess}
        />
      )}
      {room.status === "round_end" && round && (
        <RoundEnd
          round={round}
          players={players}
          guessesByPlayer={guessesByPlayer}
          isHost={room.hostPlayerId === myPlayerId}
          isFinalRound={room.currentRound >= room.roundCount}
          onNext={handleNextRound}
          advancing={advancing}
        />
      )}
    </main>
  );
}
