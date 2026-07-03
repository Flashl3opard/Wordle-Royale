export type TileColor = "green" | "yellow" | "gray";

export interface GuessAttempt {
  word: string;
  tiles: TileColor[];
  pointsEarned: number;
  submittedAt: number;
}

export type RoomStatus = "lobby" | "in_round" | "round_end" | "finished";
export type GameMode = "timed" | "infinite";

export interface RoomDoc {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  mode: GameMode;
  roundDurationMs: number;
  createdAt: number;
  expiresAt: number;
}

export interface PlayerDoc {
  nickname: string;
  isHost: boolean;
  connected: boolean;
  totalScore: number;
  joinedAt: number;
  lastGuessAt: number | null;
}

export interface RoundDoc {
  roundNumber: number;
  secretWord: string;
  startedAt: number;
  roundEndsAt: number | null;
  status: "active" | "ended";
  solvedBy: string[];
}

export interface GuessDoc {
  attempts: GuessAttempt[];
  solved: boolean;
  totalPointsThisRound: number;
}
