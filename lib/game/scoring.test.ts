import { describe, expect, it } from "vitest";
import { calculateGuessPoints, calculateSpeedMultiplier } from "./scoring";

describe("calculateSpeedMultiplier", () => {
  it("clamps to 2.0x when there is a full round of time remaining", () => {
    expect(calculateSpeedMultiplier(30000, 30000)).toBe(2);
  });

  it("clamps to 1.0x at zero time remaining", () => {
    expect(calculateSpeedMultiplier(0, 30000)).toBe(1);
  });

  it("never exceeds 2.0x even with excess time remaining", () => {
    expect(calculateSpeedMultiplier(999999, 30000)).toBe(2);
  });

  it("interpolates linearly between the bounds", () => {
    expect(calculateSpeedMultiplier(15000, 30000)).toBeCloseTo(1.5, 5);
  });

  it("returns a flat 1.0x when time remaining is null (infinite mode)", () => {
    expect(calculateSpeedMultiplier(null, 30000)).toBe(1);
  });
});

describe("calculateGuessPoints", () => {
  it("matches the spec example: instant all-green solve nets 200", () => {
    const points = calculateGuessPoints({
      tiles: ["green", "green", "green", "green", "green"],
      solved: true,
      timeRemainingMs: 30000,
      roundDurationMs: 30000,
    });
    expect(points).toBe(200);
  });

  it("matches the spec example: last-second correct guess nets close to 100", () => {
    const points = calculateGuessPoints({
      tiles: ["green", "green", "green", "green", "green"],
      solved: true,
      timeRemainingMs: 0,
      roundDurationMs: 30000,
    });
    expect(points).toBe(100);
  });

  it("banks partial points for an unsolved guess with some yellows", () => {
    const points = calculateGuessPoints({
      tiles: ["yellow", "yellow", "gray", "gray", "gray"],
      solved: false,
      timeRemainingMs: 15000,
      roundDurationMs: 30000,
    });
    expect(points).toBe(15);
  });

  it("gives zero points for an all-gray unsolved guess", () => {
    const points = calculateGuessPoints({
      tiles: ["gray", "gray", "gray", "gray", "gray"],
      solved: false,
      timeRemainingMs: 30000,
      roundDurationMs: 30000,
    });
    expect(points).toBe(0);
  });

  it("infinite mode: solved guess with all-green tiles nets flat 100 (no speed bonus)", () => {
    const points = calculateGuessPoints({
      tiles: ["green", "green", "green", "green", "green"],
      solved: true,
      timeRemainingMs: null,
      roundDurationMs: 30000,
    });
    expect(points).toBe(100);
  });

  it("infinite mode: partial yellow guess still banks flat points", () => {
    const points = calculateGuessPoints({
      tiles: ["yellow", "yellow", "gray", "gray", "gray"],
      solved: false,
      timeRemainingMs: null,
      roundDurationMs: 30000,
    });
    expect(points).toBe(10);
  });
});
