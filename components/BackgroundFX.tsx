"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Intensity = "calm" | "energetic" | "max";

const EMOJI = ["🎉", "⭐", "✨", "🔤", "💥", "🟩", "🟨", "🎈"];

const INTENSITY_CONFIG: Record<
  Intensity,
  { count: number; minDuration: number; maxDuration: number; minScale: number; maxScale: number }
> = {
  calm: { count: 16, minDuration: 10, maxDuration: 18, minScale: 0.7, maxScale: 1.1 },
  energetic: { count: 24, minDuration: 6, maxDuration: 12, minScale: 0.8, maxScale: 1.3 },
  max: { count: 34, minDuration: 3, maxDuration: 7, minScale: 0.9, maxScale: 1.6 },
};

interface FloatingItem {
  id: number;
  emoji: string;
  left: number;
  top: number;
  duration: number;
  delay: number;
  scale: number;
  deltaX: number;
  deltaY: number;
  rotateDirection: number;
}

function generateItems(intensity: Intensity): FloatingItem[] {
  const config = INTENSITY_CONFIG[intensity];
  return Array.from({ length: config.count }, (_, i) => ({
    id: i,
    emoji: EMOJI[i % EMOJI.length],
    left: Math.random() * 100,
    top: Math.random() * 100,
    duration: config.minDuration + Math.random() * (config.maxDuration - config.minDuration),
    delay: Math.random() * 4,
    scale: config.minScale + Math.random() * (config.maxScale - config.minScale),
    deltaX: (Math.random() - 0.5) * 240,
    deltaY: (Math.random() - 0.5) * 240,
    rotateDirection: Math.random() > 0.5 ? 1 : -1,
  }));
}

export function BackgroundFX({ intensity }: { intensity: Intensity }) {
  const [items, setItems] = useState<FloatingItem[]>([]);

  useEffect(() => {
    // Randomizing during render (e.g. via useMemo) would produce different
    // Math.random() values on the server-rendered pass vs. the client's first
    // render, causing a hydration mismatch. Deferring to an effect means both
    // the server HTML and the client's pre-hydration render agree on an empty
    // array, and the randomized items pop in a frame after mount instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: avoids SSR/client Math.random() hydration mismatch, see above
    setItems(generateItems(intensity));
  }, [intensity]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {items.map((item) => (
        <motion.span
          key={item.id}
          className="absolute select-none text-3xl opacity-40"
          style={{ left: `${item.left}%`, top: `${item.top}%`, scale: item.scale }}
          animate={{
            x: [0, item.deltaX, 0, -item.deltaX, 0],
            y: [0, item.deltaY, 0, -item.deltaY, 0],
            rotate: [0, 15 * item.rotateDirection, 0, -15 * item.rotateDirection, 0],
          }}
          transition={{
            duration: item.duration,
            delay: item.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {item.emoji}
        </motion.span>
      ))}
    </div>
  );
}
