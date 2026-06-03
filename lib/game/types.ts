// Game state types for Entropy Roulette

export type GamePhase =
  | "IDLE"
  | "LOBBY_OPEN"
  | "LOBBY_CLOSED"
  | "COLLECTING_SIGNATURES"
  | "FINALIZED"
  | "BROADCAST"
  | "CONFIRMED"
  | "COMPLETE";

export interface Player {
  id: string;
  pubkey: string; // Nostr npub or generated
  displayName: string;
  amount: number; // sats
  receivingAddress: string; // Player's wallet address to receive winnings
  utxo?: UTXO;
  signedPsbt?: string; // base64
  joinedAt: number;
  signedAt?: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number; // sats
  scriptPubKey: string;
}

export interface GameSession {
  id: string;
  phase: GamePhase;
  presenterPubkey: string;
  players: Player[];
  basePsbt?: string; // Initial PSBT from presenter
  combinedPsbt?: string; // After all signatures
  finalizedPsbt?: string; // Ready for broadcast
  rawTx?: string; // Final transaction hex
  txid?: string; // After broadcast
  winnerId?: string;
  winnerIndex?: number;
  feeRate: number; // sat/vB
  minBet: number; // minimum sats
  maxBet: number; // maximum sats
  createdAt: number;
  closedAt?: number;
  broadcastAt?: number;
  confirmedAt?: number;
}

export interface GameResult {
  txid: string;
  winnerId: string;
  winnerPubkey: string;
  winnerDisplayName: string;
  totalPot: number;
  playerCount: number;
  entropyByte: number;
  calculation: string; // "0xAB % 5 = 3"
}

export interface NostrGameEvent {
  type: "session" | "join" | "psbt" | "state" | "result";
  gameId: string;
  data: unknown;
  timestamp: number;
}

// Nostr event kinds for game
export const NOSTR_KINDS = {
  GAME_SESSION: 30078, // Parameterized replaceable
  PLAYER_JOIN: 20001, // Ephemeral
  PSBT_FRAGMENT: 20002, // Ephemeral
  GAME_STATE: 20003, // Ephemeral
  GAME_RESULT: 20004, // Ephemeral
} as const;

// Default game configuration
export const DEFAULT_CONFIG = {
  minBet: 5000, // 5k sats
  maxBet: 1000000, // 1M sats
  defaultBet: 25000, // 25k sats
  presenterBet: 50000, // 50k sats (sponsor input)
  feeRate: 10, // sat/vB
} as const;

// Relay URLs
export const NOSTR_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
] as const;
