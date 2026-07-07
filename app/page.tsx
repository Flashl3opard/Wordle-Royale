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
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-surface p-6">
      <div className="pointer-events-none absolute top-10 left-8 h-16 w-16 rotate-12 rounded-3xl bg-accent-tertiary shadow-(--shadow-clay-sm) sm:h-24 sm:w-24" />
      <div className="pointer-events-none absolute right-10 bottom-16 h-20 w-20 -rotate-12 rounded-full bg-accent-quaternary shadow-(--shadow-clay-sm) sm:h-28 sm:w-28" />
      <div className="pointer-events-none absolute top-1/3 right-6 h-10 w-10 rotate-45 rounded-2xl bg-accent-secondary shadow-(--shadow-clay-sm) sm:h-14 sm:w-14" />

      <h1 className="relative font-display text-5xl uppercase text-ink sm:text-6xl">
        <span className="text-accent-primary">Wordle</span> Arena
      </h1>
      <form
        onSubmit={handleCreateRoom}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-clay)] bg-white p-5 shadow-(--shadow-clay-lg)"
      >
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
          className="rounded-2xl bg-accent-primary px-4 py-3 font-display uppercase tracking-wide text-white shadow-(--shadow-clay) transition-transform active:scale-95 active:shadow-(--shadow-clay-pressed) disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>
        <a
          href="/join"
          className="text-center text-sm font-bold uppercase text-accent-blue underline decoration-2 underline-offset-4"
        >
          Have a room code? Join instead
        </a>
        {error && <p className="text-sm font-bold text-accent-primary">{error}</p>}
      </form>

      <footer className="relative mt-4 text-center text-sm font-bold uppercase tracking-wide text-ink/70">
        Made with ❤️ by{" "}
        <a
          href="https://github.com/FlashL3opard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-blue underline decoration-2 underline-offset-4 hover:text-accent-primary"
        >
          FlashL3opard
        </a>
      </footer>
    </main>
  );
}
