// Game state management for Entropy Roulette

import type { GameSession, GamePhase, Player, GameResult } from "./types";
import { DEFAULT_CONFIG } from "./types";

// Generate a random game ID
export function generateGameId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Generate a random player ID
export function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Generate anonymous display name
export function generateAnonymousName(): string {
  const adjectives = [
    "Satoshi",
    "Anonymous",
    "Shadow",
    "Crypto",
    "Digital",
    "Neural",
    "Quantum",
    "Cyber",
    "Phantom",
    "Vector",
    "Binary",
    "Zero",
    "Null",
    "Void",
    "Ghost",
    "Stealth",
  ];

  const nouns = [
    "Hodler",
    "Node",
    "Miner",
    "Whale",
    "Pleb",
    "Cypherpunk",
    "Maximalist",
    "Stacker",
    "Runner",
    "Agent",
    "Protocol",
    "Signal",
    "Hash",
    "Block",
    "Chain",
    "Key",
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);

  return `${adj}${noun}${num}`;
}

// Create initial game session
export function createGameSession(presenterPubkey: string): GameSession {
  return {
    id: generateGameId(),
    phase: "IDLE",
    presenterPubkey,
    players: [],
    feeRate: DEFAULT_CONFIG.feeRate,
    minBet: DEFAULT_CONFIG.minBet,
    maxBet: DEFAULT_CONFIG.maxBet,
    createdAt: Date.now(),
  };
}

// Add player to session
export function addPlayer(
  session: GameSession,
  pubkey: string,
  displayName: string,
  amount: number,
  receivingAddress: string
): GameSession {
  if (session.phase !== "LOBBY_OPEN") {
    throw new Error("Lobby is not open");
  }

  if (amount < session.minBet || amount > session.maxBet) {
    throw new Error(
      `Bet must be between ${session.minBet} and ${session.maxBet} sats`
    );
  }

  const newPlayer: Player = {
    id: generatePlayerId(),
    pubkey,
    displayName,
    amount,
    receivingAddress,
    joinedAt: Date.now(),
  };

  return {
    ...session,
    players: [...session.players, newPlayer],
  };
}

// Transition game phase
export function transitionPhase(
  session: GameSession,
  newPhase: GamePhase
): GameSession {
  const validTransitions: Record<GamePhase, GamePhase[]> = {
    IDLE: ["LOBBY_OPEN"],
    LOBBY_OPEN: ["LOBBY_CLOSED"],
    LOBBY_CLOSED: ["COLLECTING_SIGNATURES"],
    COLLECTING_SIGNATURES: ["FINALIZED"],
    FINALIZED: ["BROADCAST"],
    BROADCAST: ["CONFIRMED"],
    CONFIRMED: ["COMPLETE"],
    COMPLETE: [],
  };

  if (!validTransitions[session.phase].includes(newPhase)) {
    throw new Error(
      `Invalid transition from ${session.phase} to ${newPhase}`
    );
  }

  const updates: Partial<GameSession> = { phase: newPhase };

  if (newPhase === "LOBBY_CLOSED") {
    updates.closedAt = Date.now();
  }
  if (newPhase === "BROADCAST") {
    updates.broadcastAt = Date.now();
  }
  if (newPhase === "CONFIRMED") {
    updates.confirmedAt = Date.now();
  }

  return { ...session, ...updates };
}

// Update player with signed PSBT
export function updatePlayerSignature(
  session: GameSession,
  playerId: string,
  signedPsbt: string
): GameSession {
  return {
    ...session,
    players: session.players.map((p) =>
      p.id === playerId
        ? { ...p, signedPsbt, signedAt: Date.now() }
        : p
    ),
  };
}

// Check if all players have signed
export function allPlayersSigned(session: GameSession): boolean {
  return session.players.every((p) => p.signedPsbt);
}

// Calculate total pot
export function calculateTotalPot(session: GameSession): number {
  return session.players.reduce((sum, p) => sum + p.amount, 0);
}

// Get player by ID
export function getPlayerById(
  session: GameSession,
  playerId: string
): Player | undefined {
  return session.players.find((p) => p.id === playerId);
}

// Get player by pubkey
export function getPlayerByPubkey(
  session: GameSession,
  pubkey: string
): Player | undefined {
  return session.players.find((p) => p.pubkey === pubkey);
}

// Get winner
export function getWinner(session: GameSession): Player | undefined {
  if (!session.winnerId) return undefined;
  return getPlayerById(session, session.winnerId);
}

// Get winner's receiving address
export function getWinnerAddress(session: GameSession): string | undefined {
  const winner = getWinner(session);
  return winner?.receivingAddress;
}

// Create game result
export function createGameResult(
  session: GameSession,
  txid: string,
  winnerIndex: number,
  entropyByte: number,
  calculation: string
): GameResult {
  const winner = session.players[winnerIndex];

  return {
    txid,
    winnerId: winner.id,
    winnerPubkey: winner.pubkey,
    winnerDisplayName: winner.displayName,
    totalPot: calculateTotalPot(session),
    playerCount: session.players.length,
    entropyByte,
    calculation,
  };
}

// Serialize session for Nostr event
export function serializeSession(session: GameSession): string {
  return JSON.stringify(session);
}

// Deserialize session from Nostr event
export function deserializeSession(data: string): GameSession {
  return JSON.parse(data);
}

// Get phase display name
export function getPhaseDisplayName(phase: GamePhase): string {
  switch (phase) {
    case "IDLE":
      return "Initializing";
    case "LOBBY_OPEN":
      return "Lobby Open";
    case "LOBBY_CLOSED":
      return "Lobby Closed";
    case "COLLECTING_SIGNATURES":
      return "Collecting Signatures";
    case "FINALIZED":
      return "PSBT Finalized";
    case "BROADCAST":
      return "Transaction Broadcast";
    case "CONFIRMED":
      return "Block Confirmed";
    case "COMPLETE":
      return "Game Complete";
  }
}

// Get phase description
export function getPhaseDescription(phase: GamePhase): string {
  switch (phase) {
    case "IDLE":
      return "Preparing the entropy field...";
    case "LOBBY_OPEN":
      return "Players can join by scanning the QR code";
    case "LOBBY_CLOSED":
      return "No more players can join";
    case "COLLECTING_SIGNATURES":
      return "Waiting for all players to sign their inputs";
    case "FINALIZED":
      return "All signatures collected, PSBT ready";
    case "BROADCAST":
      return "Transaction sent to the mempool";
    case "CONFIRMED":
      return "Block mined! Calculating winner...";
    case "COMPLETE":
      return "The entropy has spoken";
  }
}
