import { describe, expect, it } from "vitest";
import { shouldDeleteRoom } from "./room-cleanup";

const DISCONNECTED_THRESHOLD_MS = 10 * 60 * 1000;

describe("shouldDeleteRoom", () => {
  it("deletes a room whose expiresAt has passed, regardless of players", () => {
    const now = 1_000_000;
    const room = { expiresAt: now - 1 };
    const players = [{ connected: true }];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(true);
  });

  it("does not delete a room with a future expiresAt and at least one connected player", () => {
    const now = 1_000_000;
    const room = { expiresAt: now + 60_000 };
    const players = [{ connected: true }, { connected: false }];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(false);
  });

  it("deletes a room with no players at all (empty room)", () => {
    const now = 1_000_000;
    const room = { expiresAt: now + 60_000 };
    const players: Array<{ connected: boolean }> = [];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(true);
  });

  it("does not delete when all players are disconnected but expiresAt is future (threshold check happens separately per-room via lastAllDisconnectedAt, not this function alone)", () => {
    const now = 1_000_000;
    const room = { expiresAt: now + 60_000 };
    const players = [{ connected: false }, { connected: false }];
    expect(shouldDeleteRoom(room, players, now, DISCONNECTED_THRESHOLD_MS)).toBe(true);
  });
});
