"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  roundEndsAt: number;
  roundDurationMs: number;
  onExpire: () => void;
}

export function Timer({ roundEndsAt, roundDurationMs, onExpire }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, roundEndsAt - Date.now()));

  useEffect(() => {
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

  const seconds = Math.ceil(remainingMs / 1000);
  const percent = Math.min(100, Math.max(0, (remainingMs / roundDurationMs) * 100));

  return (
    <div className="w-full max-w-md">
      <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
        <div
          className="h-full bg-green-500 transition-[width] duration-200 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-center text-sm text-gray-600">{seconds}s</p>
    </div>
  );
}
