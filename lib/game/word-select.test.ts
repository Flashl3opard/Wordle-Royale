import { describe, expect, it } from "vitest";
import { pickSecretWord } from "./word-select";
import { ANSWERS } from "../words/answers";

describe("pickSecretWord", () => {
  it("returns a word from the answers list", () => {
    expect(ANSWERS).toContain(pickSecretWord());
  });

  it("avoids excluded words when alternatives exist", () => {
    const exclude = ANSWERS.slice(0, ANSWERS.length - 1);
    const picked = pickSecretWord(exclude);
    expect(picked).toBe(ANSWERS[ANSWERS.length - 1]);
  });

  it("falls back to the full pool if every word is excluded", () => {
    const picked = pickSecretWord(ANSWERS);
    expect(ANSWERS).toContain(picked);
  });
});
