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
    <form
      onSubmit={handleJoin}
      className="flex w-full max-w-sm flex-col gap-4 border-4 border-black bg-white p-5 shadow-(--shadow-brutal)"
    >
      <p className="text-center font-(--font-display) text-2xl uppercase tracking-wide">
        Join room {roomCode}
      </p>
      <input
        className="border-4 border-black px-3 py-2 font-bold placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-secondary"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="border-4 border-black bg-accent-primary px-4 py-3 font-(--font-display) uppercase tracking-wide text-white shadow-(--shadow-brutal) transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#000] disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Room"}
      </button>
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
    </form>
  );
}
