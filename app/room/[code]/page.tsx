"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearPlayerId, getPlayerId, savePlayerId } from "@/lib/player-session";
import { useRoomStore } from "@/store/useRoomStore";
import { useRoomSubscription } from "@/hooks/useRoomSubscription";
import { Lobby } from "@/components/Lobby";
import { JoinInline } from "@/components/JoinInline";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = params.code.toUpperCase();

  const [myPlayerId, setMyPlayerId] = useState<string | null | undefined>(undefined);

  useRoomSubscription(roomCode);
  const room = useRoomStore((s) => s.room);
  const players = useRoomStore((s) => s.players);

  useEffect(() => {
    setMyPlayerId(getPlayerId(roomCode));
  }, [roomCode]);

  function handleLeave() {
    clearPlayerId(roomCode);
    router.push("/");
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
          onJoined={(id) => {
            savePlayerId(roomCode, id);
            setMyPlayerId(id);
          }}
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
    </main>
  );
}
