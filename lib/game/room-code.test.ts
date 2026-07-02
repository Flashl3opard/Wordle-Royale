import { describe, expect, it } from "vitest";
import { generateRoomCode, ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "./room-code";

describe("generateRoomCode", () => {
  it("returns a code of the configured length", () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("only uses characters from the charset", () => {
    const code = generateRoomCode();
    for (const char of code) {
      expect(ROOM_CODE_CHARSET).toContain(char);
    }
  });

  it("excludes visually ambiguous characters", () => {
    for (const banned of ["0", "O", "1", "I"]) {
      expect(ROOM_CODE_CHARSET).not.toContain(banned);
    }
  });

  it("produces different codes across many calls (extremely unlikely to collide)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
