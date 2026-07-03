"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ToastMessage } from "@/hooks/usePresenceToasts";

interface ToastStackProps {
  toasts: ToastMessage[];
}

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`border-4 border-black px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0_#000] ${
              toast.kind === "left" ? "bg-accent-primary text-white" : "bg-accent-secondary text-black"
            }`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
