import { ANSWERS } from "../words/answers";

export function pickSecretWord(excludeWords: string[] = []): string {
  const exclude = new Set(excludeWords.map((w) => w.toLowerCase()));
  const pool = ANSWERS.filter((w) => !exclude.has(w.toLowerCase()));
  const candidates = pool.length > 0 ? pool : ANSWERS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
