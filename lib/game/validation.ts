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

export const roomSettingsSchema = z.object({
  playerId: z.string().min(1),
  roundCount: z.number().int().min(1).max(20),
  roundDurationMs: z.number().int().min(10000).max(120000),
});

export const startRoomSchema = z.object({
  playerId: z.string().min(1),
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

export const roundNextSchema = z.object({
  playerId: z.string().min(1),
});

export const resetRoomSchema = z.object({
  playerId: z.string().min(1),
});

export const presenceSchema = z.object({
  playerId: z.string().min(1),
});
