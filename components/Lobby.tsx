"use client";

import { useState } from "react";
import type { PlayerWithId } from "@/store/useRoomStore";
import type { GameMode, RoomDoc } from "@/lib/game/types";

const PLAYER_COLORS = ["#ff3d3d", "#2f6bff", "#00e0d3", "#ff2fb0", "#ffd600", "#00c853"];

interface LobbyProps {
  room: RoomDoc;
  players: PlayerWithId[];
  myPlayerId: string;
  roomCode: string;
  onLeave: () => void;
}

export function Lobby({ room, players, myPlayerId, roomCode, onLeave }: LobbyProps) {
  const isHost = room.hostPlayerId === myPlayerId;
  const [mode, setMode] = useState<GameMode>(room.mode);
  const [roundDurationMin, setRoundDurationMin] = useState(room.roundDurationMs / 60000);
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

  async function saveSettings(nextMode: GameMode, nextDurationMin: number) {
    await fetch(`/api/rooms/${roomCode}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        mode: nextMode,
        ...(nextMode === "timed" ? { roundDurationMs: Math.round(nextDurationMin * 60000) } : {}),
      }),
    });
  }

  function selectMode(nextMode: GameMode) {
    setMode(nextMode);
    saveSettings(nextMode, roundDurationMin);
  }

  async function startGame() {
    setError(null);
    setStarting(true);
    const res = await fetch(`/api/rooms/${roomCode}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: myPlayerId,
        mode,
        ...(mode === "timed" ? { roundDurationMs: Math.round(roundDurationMin * 60000) } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    setStarting(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="border-4 border-black bg-accent-secondary p-4 text-center shadow-(--shadow-brutal-lg)">
        <p className="text-xs font-bold uppercase tracking-widest text-black/70">Room code</p>
        <p className="font-(--font-display) text-4xl uppercase tracking-widest">{roomCode}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {players.map((p, i) => (
          <li
            key={p.id}
            className="flex items-center justify-between border-4 border-black bg-white px-3 py-2 font-bold"
            style={{ borderLeft: `10px solid ${PLAYER_COLORS[i % PLAYER_COLORS.length]}` }}
          >
            <span>{p.nickname}</span>
            {p.isHost && (
              <span className="border-2 border-black bg-accent-quaternary px-2 py-0.5 text-xs font-black uppercase text-white">
                Host
              </span>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="flex flex-col gap-4 border-4 border-black bg-white p-4 shadow-(--shadow-brutal)">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selectMode("timed")}
              className={`flex-1 border-4 border-black py-2 font-(--font-display) uppercase tracking-wide ${
                mode === "timed" ? "bg-accent-primary text-white" : "bg-white"
              }`}
            >
              Timed
            </button>
            <button
              type="button"
              onClick={() => selectMode("infinite")}
              className={`flex-1 border-4 border-black py-2 font-(--font-display) uppercase tracking-wide ${
                mode === "infinite" ? "bg-accent-tertiary text-black" : "bg-white"
              }`}
            >
              Infinite
            </button>
          </div>
          {mode === "timed" && (
            <label className="flex items-center justify-between text-sm font-bold uppercase">
              Round duration (min)
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={roundDurationMin}
                onChange={(e) => setRoundDurationMin(Number(e.target.value))}
                onBlur={() => saveSettings(mode, roundDurationMin)}
                className="w-20 border-4 border-black px-2 py-1 text-center"
              />
            </label>
          )}
          <button
            onClick={startGame}
            disabled={players.length < 2 || starting}
            className="border-4 border-black bg-accent-blue px-4 py-3 font-(--font-display) uppercase tracking-wide text-white shadow-(--shadow-brutal) transition-transform hover:-translate-x-1 hover:-translate-y-1 hover:shadow-(--shadow-brutal-lg) disabled:opacity-50"
          >
            {players.length < 2 ? "Need 2+ players" : starting ? "Starting..." : "Start Game"}
          </button>
        </div>
      )}
      <button
        onClick={leaveRoom}
        disabled={leaving}
        className="text-sm font-bold uppercase underline decoration-2 underline-offset-4 disabled:opacity-50"
      >
        {leaving ? "Leaving..." : "Leave Room"}
      </button>
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
    </div>
  );
}
