"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearPlayerId, savePlayerId, usePlayerId } from "@/lib/player-session";
import { useRoomStore } from "@/store/useRoomStore";
import { useRoomSubscription } from "@/hooks/useRoomSubscription";
import { useRoundSubscription } from "@/hooks/useRoundSubscription";
import { useMyGuessSubscription } from "@/hooks/useMyGuessSubscription";
import { useRoundGuesses } from "@/hooks/useRoundGuesses";
import { usePresenceSync } from "@/hooks/usePresenceSync";
import { usePresenceToasts } from "@/hooks/usePresenceToasts";
import { registerPresence } from "@/lib/firebase/presence";
import { Lobby } from "@/components/Lobby";
import { JoinInline } from "@/components/JoinInline";
import { RoundPlay } from "@/components/RoundPlay";
import { Podium } from "@/components/Podium";
import { ToastStack } from "@/components/Toast";

const ROUND_NUMBER = 1;

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = params.code.toUpperCase();

  const myPlayerId = usePlayerId(roomCode);

  useRoomSubscription(roomCode);
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);

  const round = useRoundSubscription(roomCode, ROUND_NUMBER);
  const myGuess = useMyGuessSubscription(roomCode, ROUND_NUMBER, myPlayerId ?? null);
  const guessesByPlayer = useRoundGuesses(
    roomCode,
    ROUND_NUMBER,
    room?.status === "in_round" || room?.status === "finished"
  );

  usePresenceSync(roomCode, myPlayerId ?? null);

  useEffect(() => {
    if (!myPlayerId) return;
    return registerPresence(roomCode, myPlayerId);
  }, [roomCode, myPlayerId]);

  const toasts = usePresenceToasts(players);

  const [resetting, setResetting] = useState(false);

  function handleLeave() {
    clearPlayerId(roomCode);
    router.push("/");
  }

  async function handlePlayAgain() {
    if (!myPlayerId) return;
    setResetting(true);
    await fetch(`/api/rooms/${roomCode}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    setResetting(false);
  }

  if (myPlayerId === undefined || (myPlayerId && !room)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink/60">Loading...</p>
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
        <p className="text-lg text-ink/70">Room not found. It may have expired.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6">
      <ToastStack toasts={toasts} />
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
          players={players}
          guessesByPlayer={guessesByPlayer}
        />
      )}
      {room.status === "finished" && round && (
        <Podium
          players={players}
          isHost={room.hostPlayerId === myPlayerId}
          onPlayAgain={handlePlayAgain}
          resetting={resetting}
          secretWord={round.secretWord}
          guessesByPlayer={guessesByPlayer}
          roundStartedAt={round.startedAt}
        />
      )}
    </main>
  );
}
