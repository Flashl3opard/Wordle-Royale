"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePlayerId } from "@/lib/player-session";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      savePlayerId(data.code, data.playerId);
      router.push(`/room/${data.code}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface p-6">
      <h1 className="font-(--font-display) text-6xl uppercase tracking-tight text-ink">
        Wordle Arena
      </h1>
      <form
        onSubmit={handleCreateRoom}
        className="flex w-full max-w-sm flex-col gap-4 border-4 border-black bg-white p-5 shadow-(--shadow-brutal)"
      >
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
          {loading ? "Creating..." : "Create Room"}
        </button>
        <a
          href="/join"
          className="text-center text-sm font-bold uppercase underline decoration-2 underline-offset-4"
        >
          Have a room code? Join instead
        </a>
        {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
      </form>
    </main>
  );
}
