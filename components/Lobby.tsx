"use client";

import { useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { RoomDoc } from "@/lib/game/types";

interface LobbyProps {
  room: RoomDoc;
  players: PlayerWithId[];
  myPlayerId: string;
  roomCode: string;
  onLeave: () => void;
}

export function Lobby({ room, players, myPlayerId, roomCode, onLeave }: LobbyProps) {
  const isHost = room.hostPlayerId === myPlayerId;
  const [roundCount, setRoundCount] = useState(room.roundCount);
  const [roundDurationSec, setRoundDurationSec] = useState(room.roundDurationMs / 1000);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leaveRoom() {
    setLeaving(true);
    await fetch(`/api/rooms/${roomCode}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    onLeave();
  }

  async function saveSettings() {
    await fetch(`/api/rooms/${roomCode}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        roundCount,
        roundDurationMs: roundDurationSec * 1000,
      }),
    });
  }

  async function startGame() {
    setError(null);
    setStarting(true);
    const res = await fetch(`/api/rooms/${roomCode}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: myPlayerId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    setStarting(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="rounded border border-gray-300 p-4 text-center">
        <p className="text-sm text-gray-500">Room code</p>
        <p className="text-3xl font-bold tracking-widest">{roomCode}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
          >
            <span>{p.nickname}</span>
            {p.isHost && (
              <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-semibold">
                Host
              </span>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-3">
          <label className="flex items-center justify-between text-sm">
            Rounds
            <input
              type="number"
              min={1}
              max={20}
              value={roundCount}
              onChange={(e) => setRoundCount(Number(e.target.value))}
              onBlur={saveSettings}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            Round duration (sec)
            <input
              type="number"
              min={10}
              max={120}
              value={roundDurationSec}
              onChange={(e) => setRoundDurationSec(Number(e.target.value))}
              onBlur={saveSettings}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <button
            onClick={startGame}
            disabled={players.length < 2 || starting}
            className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {players.length < 2 ? "Need 2+ players" : starting ? "Starting..." : "Start Game"}
          </button>
        </div>
      )}
      <button
        onClick={leaveRoom}
        disabled={leaving}
        className="text-sm text-gray-500 underline disabled:opacity-50"
      >
        {leaving ? "Leaving..." : "Leave Room"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
