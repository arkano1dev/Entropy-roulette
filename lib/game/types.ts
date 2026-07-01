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
  escrowAddress?: string; // Presenter's escrow address (their Xverse address)
  presenterAddress?: string; // Presenter's escrow address
  players: Player[];
  basePsbt?: string; // Initial PSBT from presenter
  combinedPsbt?: string; // After all signatures
  finalizedPsbt?: string; // Ready for broadcast (Tx 1)
  rawTx?: string; // Final transaction hex
  txid?: string; // After broadcast (Tx 1)
  payoutTxid?: string; // Tx 2 payout
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
  PSBT_PUBLISH: 20005, // NEW: presenter publishes full PSBT for signing
  PAYOUT_TX: 20006, // NEW: payout transaction broadcast
} as const;

// Default game configuration
export const DEFAULT_CONFIG = {
  minBet: 1000, // 1k sats
  maxBet: 1000000, // 1M sats
  defaultBet: 25000, // 25k sats
  presenterBet: 50000, // 50k sats (sponsor input)
  feeRate: 10, // sat/vB
} as const;

// Relay URLs — all confirmed write-capable (relay.nostr.band was dropped: it is
// an indexer/read relay that rejects writes and was frequently unreachable).
export const NOSTR_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
] as const;
