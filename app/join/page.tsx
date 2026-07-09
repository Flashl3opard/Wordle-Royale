"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePlayerId } from "@/lib/player-session";
import { BackgroundFX } from "@/components/BackgroundFX";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const upperCode = code.trim().toUpperCase();
    try {
      const res = await fetch(`/api/rooms/${upperCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      savePlayerId(upperCode, data.playerId);
      router.push(`/room/${upperCode}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden p-6">
      <BackgroundFX intensity="calm" />
      <h1 className="relative font-display text-4xl uppercase text-ink sm:text-5xl">
        Join <span className="text-accent-blue">Room</span>
      </h1>
      <form
        onSubmit={handleJoin}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-clay)] bg-card p-5 shadow-(--shadow-clay-lg)"
      >
        <input
          className="rounded-2xl bg-surface px-3 py-2 text-center font-bold uppercase tracking-widest shadow-(--shadow-clay-pressed) placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-blue"
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
        />
        <input
          className="rounded-2xl bg-surface px-3 py-2 font-bold shadow-(--shadow-clay-pressed) placeholder:font-normal placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-accent-blue"
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
        {error && <p className="text-center text-sm font-bold text-accent-primary">{error}</p>}
      </form>
    </main>
  );
}
