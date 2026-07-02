import type { TileColor } from "./types";

export function computeTileResults(secret: string, guess: string): TileColor[] {
  const secretLetters = secret.toLowerCase().split("");
  const guessLetters = guess.toLowerCase().split("");
  const result: TileColor[] = new Array(guessLetters.length).fill("gray");
  const remaining: Record<string, number> = {};

  for (let i = 0; i < guessLetters.length; i++) {
    if (guessLetters[i] === secretLetters[i]) {
      result[i] = "green";
    } else {
      remaining[secretLetters[i]] = (remaining[secretLetters[i]] ?? 0) + 1;
    }
  }

  for (let i = 0; i < guessLetters.length; i++) {
    if (result[i] === "green") continue;
    const letter = guessLetters[i];
    if (remaining[letter] > 0) {
      result[i] = "yellow";
      remaining[letter] -= 1;
    }
  }

  return result;
}
