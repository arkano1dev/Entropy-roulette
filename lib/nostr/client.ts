// Nostr client for Entropy Roulette
// Handles relay connections, event publishing, and subscriptions

import {
  SimplePool,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type Event,
  type Filter,
} from "nostr-tools";
import { NOSTR_RELAYS, NOSTR_KINDS } from "@/lib/game/types";
import type { GameSession } from "@/lib/game/types";

// Nostr pool for managing relay connections
let pool: SimplePool | null = null;

// Get or create the pool
export function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool();
  }
  return pool;
}

// Close the pool
export function closePool(): void {
  if (pool) {
    pool.close(NOSTR_RELAYS as unknown as string[]);
    pool = null;
  }
}

// Generate a new keypair
export function generateKeypair(): { secretKey: Uint8Array; pubkey: string } {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return { secretKey, pubkey };
}

// Convert pubkey to npub format (display only)
export function pubkeyToNpub(pubkey: string): string {
  // Simple base32 encoding for display - full bech32 would require additional lib
  return `npub1${pubkey.slice(0, 20)}...`;
}

// Publish a game session event
export async function publishGameSession(
  secretKey: Uint8Array,
  session: GameSession
): Promise<void> {
  const pool = getPool();
  const pubkey = getPublicKey(secretKey);

  const eventTemplate = {
    kind: NOSTR_KINDS.GAME_SESSION,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", session.id],
      ["name", "Entropy Roulette"],
      ["status", session.phase],
      ["pot", calculateTotalPot(session).toString()],
      ["players", session.players.length.toString()],
    ],
    content: JSON.stringify({
      phase: session.phase,
      players: session.players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        amount: p.amount,
        signed: !!p.signedPsbt,
      })),
      potAddress: session.potAddress,
      feeRate: session.feeRate,
    }),
    pubkey,
  };

  const event = finalizeEvent(eventTemplate, secretKey);
  await Promise.any(
    pool.publish(NOSTR_RELAYS as unknown as string[], event)
  );
}

// Publish player join event
export async function publishPlayerJoin(
  secretKey: Uint8Array,
  gameId: string,
  playerId: string,
  displayName: string,
  amount: number
): Promise<void> {
  const pool = getPool();
  const pubkey = getPublicKey(secretKey);

  const eventTemplate = {
    kind: NOSTR_KINDS.PLAYER_JOIN,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", gameId],
      ["p", pubkey],
      ["playerId", playerId],
      ["amount", amount.toString()],
    ],
    content: JSON.stringify({
      playerId,
      displayName,
      amount,
    }),
    pubkey,
  };

  const event = finalizeEvent(eventTemplate, secretKey);
  await Promise.any(
    pool.publish(NOSTR_RELAYS as unknown as string[], event)
  );
}

// Publish PSBT fragment (signed input)
export async function publishPsbtFragment(
  secretKey: Uint8Array,
  gameId: string,
  playerId: string,
  signedPsbt: string
): Promise<void> {
  const pool = getPool();
  const pubkey = getPublicKey(secretKey);

  const eventTemplate = {
    kind: NOSTR_KINDS.PSBT_FRAGMENT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", gameId],
      ["p", pubkey],
      ["playerId", playerId],
    ],
    content: signedPsbt, // Base64 encoded signed PSBT
    pubkey,
  };

  const event = finalizeEvent(eventTemplate, secretKey);
  await Promise.any(
    pool.publish(NOSTR_RELAYS as unknown as string[], event)
  );
}

// Publish game state update
export async function publishGameState(
  secretKey: Uint8Array,
  gameId: string,
  phase: string,
  totalPot: number,
  playerCount: number,
  txid?: string
): Promise<void> {
  const pool = getPool();
  const pubkey = getPublicKey(secretKey);

  const tags: string[][] = [
    ["e", gameId],
    ["status", phase],
    ["pot", totalPot.toString()],
    ["players", playerCount.toString()],
  ];

  if (txid) {
    tags.push(["txid", txid]);
  }

  const eventTemplate = {
    kind: NOSTR_KINDS.GAME_STATE,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify({
      phase,
      totalPot,
      playerCount,
      txid,
      timestamp: Date.now(),
    }),
    pubkey,
  };

  const event = finalizeEvent(eventTemplate, secretKey);
  await Promise.any(
    pool.publish(NOSTR_RELAYS as unknown as string[], event)
  );
}

// Publish game result
export async function publishGameResult(
  secretKey: Uint8Array,
  gameId: string,
  winnerId: string,
  winnerPubkey: string,
  winnerName: string,
  totalPot: number,
  txid: string,
  calculation: string
): Promise<void> {
  const pool = getPool();
  const pubkey = getPublicKey(secretKey);

  const eventTemplate = {
    kind: NOSTR_KINDS.GAME_RESULT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", gameId],
      ["p", winnerPubkey],
      ["winner", winnerId],
      ["pot", totalPot.toString()],
      ["txid", txid],
    ],
    content: JSON.stringify({
      winnerId,
      winnerPubkey,
      winnerName,
      totalPot,
      txid,
      calculation,
      timestamp: Date.now(),
    }),
    pubkey,
  };

  const event = finalizeEvent(eventTemplate, secretKey);
  await Promise.any(
    pool.publish(NOSTR_RELAYS as unknown as string[], event)
  );
}

// Subscribe to game session updates
export function subscribeToGameSession(
  gameId: string,
  presenterPubkey: string,
  onEvent: (event: Event) => void
): () => void {
  const pool = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.GAME_SESSION],
    authors: [presenterPubkey],
    "#d": [gameId],
  };

  const sub = pool.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    [filter],
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Subscribe to player joins
export function subscribeToPlayerJoins(
  gameId: string,
  onEvent: (event: Event) => void
): () => void {
  const pool = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.PLAYER_JOIN],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600, // Last hour
  };

  const sub = pool.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    [filter],
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Subscribe to PSBT fragments
export function subscribeToPsbtFragments(
  gameId: string,
  onEvent: (event: Event) => void
): () => void {
  const pool = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.PSBT_FRAGMENT],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = pool.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    [filter],
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Subscribe to game state updates
export function subscribeToGameState(
  gameId: string,
  onEvent: (event: Event) => void
): () => void {
  const pool = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.GAME_STATE],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = pool.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    [filter],
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Subscribe to game result
export function subscribeToGameResult(
  gameId: string,
  onEvent: (event: Event) => void
): () => void {
  const pool = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.GAME_RESULT],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = pool.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    [filter],
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Helper to calculate total pot
function calculateTotalPot(session: GameSession): number {
  return session.players.reduce((sum, p) => sum + p.amount, 0);
}

// Check for NIP-07 extension (Alby, nos2x, etc.)
export function hasNostrExtension(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

// Get public key from NIP-07 extension
export async function getPublicKeyFromExtension(): Promise<string> {
  if (!hasNostrExtension()) {
    throw new Error("No Nostr extension found");
  }
  return window.nostr!.getPublicKey();
}

// Sign event with NIP-07 extension
export async function signEventWithExtension(
  event: Omit<Event, "sig">
): Promise<Event> {
  if (!hasNostrExtension()) {
    throw new Error("No Nostr extension found");
  }
  return window.nostr!.signEvent(event) as Promise<Event>;
}
