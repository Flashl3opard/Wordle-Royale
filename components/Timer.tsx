"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  roundEndsAt: number | null;
  roundDurationMs: number;
  onExpire: () => void;
  onUrgencyChange?: (urgent: boolean) => void;
}

export function Timer({ roundEndsAt, roundDurationMs, onExpire, onUrgencyChange }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    roundEndsAt === null ? 0 : Math.max(0, roundEndsAt - Date.now())
  );

  useEffect(() => {
    if (roundEndsAt === null) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, roundEndsAt - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [roundEndsAt, onExpire]);

  const percent =
    roundEndsAt === null ? 100 : Math.min(100, Math.max(0, (remainingMs / roundDurationMs) * 100));
  const urgent = roundEndsAt !== null && percent < 25;

  useEffect(() => {
    onUrgencyChange?.(urgent);
  }, [urgent, onUrgencyChange]);

  if (roundEndsAt === null) {
    return (
      <div className="w-full max-w-md border-4 border-black bg-accent-tertiary px-3 py-2 text-center shadow-(--shadow-brutal)">
        <p className="font-display text-lg uppercase tracking-widest">
          ∞ No Clock
        </p>
      </div>
    );
  }

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div
      className={`w-full max-w-md border-4 border-black bg-white shadow-(--shadow-brutal) ${
        urgent ? "animate-pulse" : ""
      }`}
    >
      <div className="h-4 w-full overflow-hidden border-b-4 border-black bg-white">
        <div
          className={`h-full transition-[width] duration-200 ease-linear ${urgent ? "bg-accent-primary" : "bg-accent-blue"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="py-1 text-center font-display text-lg uppercase">
        {seconds}s
      </p>
    </div>
  );
}
