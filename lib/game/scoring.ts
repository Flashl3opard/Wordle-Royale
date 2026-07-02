import type { TileColor } from "./types";

export interface ScoreGuessInput {
  tiles: TileColor[];
  solved: boolean;
  timeRemainingMs: number;
  roundDurationMs: number;
}

const YELLOW_POINTS = 5;
const GREEN_POINTS = 10;
const SOLVE_BONUS = 50;
const MIN_MULTIPLIER = 1;
const MAX_MULTIPLIER = 2;

export function calculateSpeedMultiplier(
  timeRemainingMs: number,
  roundDurationMs: number
): number {
  const raw = 1 + timeRemainingMs / roundDurationMs;
  return Math.min(Math.max(raw, MIN_MULTIPLIER), MAX_MULTIPLIER);
}

export function calculateGuessPoints(input: ScoreGuessInput): number {
  const { tiles, solved, timeRemainingMs, roundDurationMs } = input;
  const tilePoints = tiles.reduce((sum, tile) => {
    if (tile === "green") return sum + GREEN_POINTS;
    if (tile === "yellow") return sum + YELLOW_POINTS;
    return sum;
  }, 0);
  const bonus = solved ? SOLVE_BONUS : 0;
  const multiplier = calculateSpeedMultiplier(timeRemainingMs, roundDurationMs);
  return Math.round((tilePoints + bonus) * multiplier);
}
