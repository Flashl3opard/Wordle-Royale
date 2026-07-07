"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ToastMessage } from "@/hooks/usePresenceToasts";

interface ToastStackProps {
  toasts: ToastMessage[];
}

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -24, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`rounded-2xl px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-(--shadow-clay) ${
              toast.kind === "left" ? "bg-accent-primary text-white" : "bg-accent-tertiary text-black"
            }`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
