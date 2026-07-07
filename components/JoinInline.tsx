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
      className="flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-clay)] bg-white p-5 shadow-(--shadow-clay-lg)"
    >
      <p className="text-center font-display text-2xl uppercase tracking-wide">
        Join room <span className="text-accent-blue">{roomCode}</span>
      </p>
      <input
        className="rounded-2xl bg-surface px-3 py-2 font-bold shadow-(--shadow-clay-pressed) placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-tertiary"
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={20}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-2xl bg-accent-blue px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
      >
        {loading ? "Joining..." : "Join Room"}
      </button>
      {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
    </form>
  );
}
