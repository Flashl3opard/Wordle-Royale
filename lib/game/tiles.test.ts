import { describe, expect, it } from "vitest";
import { computeTileResults } from "./tiles";

describe("computeTileResults", () => {
  it("marks every letter green on an exact match", () => {
    expect(computeTileResults("crane", "crane")).toEqual([
      "green", "green", "green", "green", "green",
    ]);
  });

  it("marks every letter gray when there is no overlap", () => {
    expect(computeTileResults("abcde", "fghij")).toEqual([
      "gray", "gray", "gray", "gray", "gray",
    ]);
  });

  it("marks every letter yellow for a full anagram with no position matches", () => {
    expect(computeTileResults("words", "sword")).toEqual([
      "yellow", "yellow", "yellow", "yellow", "yellow",
    ]);
  });

  it("handles duplicate letters correctly (classic ABBEY vs BOBBY case)", () => {
    expect(computeTileResults("abbey", "bobby")).toEqual([
      "yellow", "gray", "green", "gray", "green",
    ]);
  });

  it("is case-insensitive", () => {
    expect(computeTileResults("CRANE", "crane")).toEqual([
      "green", "green", "green", "green", "green",
    ]);
  });
});
