import { describe, expect, it } from "vitest";
import { createRoomSchema, guessSchema, roomSettingsSchema, startRoomSchema } from "./validation";

describe("createRoomSchema", () => {
  it("accepts a valid nickname", () => {
    expect(createRoomSchema.safeParse({ nickname: "Alex" }).success).toBe(true);
  });

  it("rejects an empty nickname", () => {
    expect(createRoomSchema.safeParse({ nickname: "" }).success).toBe(false);
  });

  it("rejects a nickname over 20 characters", () => {
    expect(createRoomSchema.safeParse({ nickname: "a".repeat(21) }).success).toBe(false);
  });
});

describe("guessSchema", () => {
  it("accepts a 5-letter alphabetic word", () => {
    expect(guessSchema.safeParse({ playerId: "p1", word: "crane" }).success).toBe(true);
  });

  it("rejects a word that is not 5 letters", () => {
    expect(guessSchema.safeParse({ playerId: "p1", word: "cranes" }).success).toBe(false);
  });

  it("rejects a word containing non-letters", () => {
    expect(guessSchema.safeParse({ playerId: "p1", word: "cr4ne" }).success).toBe(false);
  });
});

describe("roomSettingsSchema", () => {
  it("accepts timed mode with a duration in bounds", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 30000 })
        .success
    ).toBe(true);
  });

  it("accepts infinite mode without a duration", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "infinite" }).success
    ).toBe(true);
  });

  it("rejects timed mode with a duration below 30s", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 5000 })
        .success
    ).toBe(false);
  });

  it("rejects timed mode with no duration at all", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed" }).success
    ).toBe(false);
  });

  it("rejects an invalid mode value", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "endless", roundDurationMs: 30000 })
        .success
    ).toBe(false);
  });
});

describe("roomSettingsSchema (minutes range)", () => {
  it("accepts a duration at the new 30s floor", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 30000 })
        .success
    ).toBe(true);
  });

  it("accepts a duration at the new 10min ceiling", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 600000 })
        .success
    ).toBe(true);
  });

  it("rejects a duration below 30s", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 10000 })
        .success
    ).toBe(false);
  });

  it("rejects a duration above 10min", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 700000 })
        .success
    ).toBe(false);
  });
});

describe("startRoomSchema", () => {
  it("accepts timed mode with a duration in bounds", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 90000 })
        .success
    ).toBe(true);
  });

  it("accepts infinite mode without a duration", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "infinite" }).success
    ).toBe(true);
  });

  it("rejects timed mode with no duration at all", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "timed" }).success
    ).toBe(false);
  });

  it("rejects timed mode with a duration out of bounds", () => {
    expect(
      startRoomSchema.safeParse({ playerId: "p1", mode: "timed", roundDurationMs: 5000 })
        .success
    ).toBe(false);
  });

  it("rejects a request missing playerId", () => {
    expect(startRoomSchema.safeParse({ mode: "infinite" }).success).toBe(false);
  });
});
