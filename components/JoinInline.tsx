"use client";

import { useState, type FormEvent } from "react";

interface JoinInlineProps {
  roomCode: string;
  onJoined: (playerId: string) => void;
}

export function JoinInline({ roomCode, onJoined }: JoinInlineProps) {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join room");
        return;
      }
      onJoined(data.playerId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleJoin} className="flex w-full max-w-sm flex-col gap-3">
      <p className="text-center text-lg font-semibold">Join room {roomCode}</p>
      <input
        className="rounded border border-gray-400 px-3 py-2"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Room"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
