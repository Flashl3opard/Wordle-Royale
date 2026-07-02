"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePlayerId } from "@/lib/player-session";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Join a Room</h1>
      <form onSubmit={handleJoin} className="flex w-full max-w-sm flex-col gap-3">
        <input
          className="rounded border border-gray-400 px-3 py-2 uppercase tracking-widest"
          placeholder="ROOM CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          required
        />
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
    </main>
  );
}
