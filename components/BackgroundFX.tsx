"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

type Intensity = "calm" | "energetic" | "max";

const EMOJI = ["🎉", "⭐", "✨", "🔤", "💥", "🟩", "🟨", "🎈"];

const INTENSITY_CONFIG: Record<
  Intensity,
  { count: number; minDuration: number; maxDuration: number; minScale: number; maxScale: number }
> = {
  calm: { count: 10, minDuration: 10, maxDuration: 16, minScale: 0.7, maxScale: 1.1 },
  energetic: { count: 16, minDuration: 6, maxDuration: 10, minScale: 0.8, maxScale: 1.3 },
  max: { count: 24, minDuration: 3, maxDuration: 6, minScale: 0.9, maxScale: 1.6 },
};

interface FloatingItem {
  id: number;
  emoji: string;
  left: number;
  top: number;
  duration: number;
  delay: number;
  scale: number;
  rotate: number;
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
    rotate: Math.random() > 0.5 ? 1 : -1,
  }));
}

export function BackgroundFX({ intensity }: { intensity: Intensity }) {
  const items = useMemo(() => generateItems(intensity), [intensity]);

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
            y: [0, -24, 0, 24, 0],
            rotate: [0, 15 * item.rotate, 0, -15 * item.rotate, 0],
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
