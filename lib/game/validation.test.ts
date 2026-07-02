import { describe, expect, it } from "vitest";
import { createRoomSchema, guessSchema, roomSettingsSchema } from "./validation";

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
  it("accepts round count and duration within bounds", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", roundCount: 6, roundDurationMs: 30000 })
        .success
    ).toBe(true);
  });

  it("rejects a round count of zero", () => {
    expect(
      roomSettingsSchema.safeParse({ playerId: "p1", roundCount: 0, roundDurationMs: 30000 })
        .success
    ).toBe(false);
  });
});
