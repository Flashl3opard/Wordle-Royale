import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "Nickname is required")
  .max(20, "Nickname must be 20 characters or fewer");

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
});

export const roomSettingsSchema = z
  .object({
    playerId: z.string().min(1),
    mode: z.enum(["timed", "infinite"]),
    roundDurationMs: z.number().int().min(30000).max(600000).optional(),
  })
  .refine((data) => data.mode !== "timed" || data.roundDurationMs !== undefined, {
    message: "roundDurationMs is required for timed mode",
    path: ["roundDurationMs"],
  });

export const startRoomSchema = z
  .object({
    playerId: z.string().min(1),
    mode: z.enum(["timed", "infinite"]),
    roundDurationMs: z.number().int().min(30000).max(600000).optional(),
  })
  .refine((data) => data.mode !== "timed" || data.roundDurationMs !== undefined, {
    message: "roundDurationMs is required for timed mode",
    path: ["roundDurationMs"],
  });

export const guessSchema = z.object({
  playerId: z.string().min(1),
  word: z
    .string()
    .length(5, "Guess must be exactly 5 letters")
    .regex(/^[a-zA-Z]+$/, "Guess must contain only letters"),
});

export const leaveRoomSchema = z.object({
  playerId: z.string().min(1),
});

export const resetRoomSchema = z.object({
  playerId: z.string().min(1),
});

export const presenceSchema = z.object({
  playerId: z.string().min(1),
});
