// Nostr client for Entropy Roulette
// Handles relay connections, event publishing, and subscriptions with retry logic

import {
  SimplePool,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type Event,
} from "nostr-tools";
// Use a loose Filter type to avoid `#x` index signature conflicts with nostr-tools
type Filter = Record<string, unknown>;
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

// Retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Generate a new keypair
export function generateKeypair(): { secretKey: Uint8Array; pubkey: string } {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return { secretKey, pubkey };
}

// Convert pubkey to npub format (display only)
export function pubkeyToNpub(pubkey: string): string {
  return `npub1${pubkey.slice(0, 20)}...`;
}

// Publish a game session event
export async function publishGameSession(
  secretKey: Uint8Array,
  session: GameSession
): Promise<void> {
  await withRetry(async () => {
    const p = getPool();
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
          receivingAddress: p.receivingAddress,
          signed: !!p.signedPsbt,
        })),
        feeRate: session.feeRate,
        escrowAddress: session.presenterAddress,
        txid: session.txid,
        payoutTxid: session.payoutTxid,
      }),
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await Promise.any(
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
}

// Publish player join event
export async function publishPlayerJoin(
  secretKey: Uint8Array,
  gameId: string,
  playerId: string,
  displayName: string,
  amount: number,
  receivingAddress: string,
  utxo?: any
): Promise<void> {
  await withRetry(async () => {
    const p = getPool();
    const pubkey = getPublicKey(secretKey);

    const eventTemplate = {
      kind: NOSTR_KINDS.PLAYER_JOIN,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", gameId],
        ["p", pubkey],
        ["playerId", playerId],
        ["amount", amount.toString()],
        ["address", receivingAddress],
      ],
      content: JSON.stringify({
        playerId,
        displayName,
        amount,
        receivingAddress,
        utxo,
      }),
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await Promise.any(
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
}

// Publish PSBT fragment (signed input)
export async function publishPsbtFragment(
  secretKey: Uint8Array,
  gameId: string,
  playerId: string,
  signedPsbt: string
): Promise<void> {
  await withRetry(async () => {
    const p = getPool();
    const pubkey = getPublicKey(secretKey);

    const eventTemplate = {
      kind: NOSTR_KINDS.PSBT_FRAGMENT,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", gameId],
        ["p", pubkey],
        ["playerId", playerId],
      ],
      content: signedPsbt,
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await Promise.any(
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
}

// Publish full PSBT for players to fetch and sign
export async function publishPsbtPublish(
  secretKey: Uint8Array,
  gameId: string,
  psbtBase64: string
): Promise<void> {
  await withRetry(async () => {
    const p = getPool();
    const pubkey = getPublicKey(secretKey);

    const eventTemplate = {
      kind: NOSTR_KINDS.PSBT_PUBLISH,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["e", gameId]],
      content: psbtBase64,
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await Promise.any(
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
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
  await withRetry(async () => {
    const p = getPool();
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
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
}

// Publish payout transaction (Tx 2)
export async function publishPayoutTx(
  secretKey: Uint8Array,
  gameId: string,
  payoutTxid: string,
  winnerAddress: string
): Promise<void> {
  await withRetry(async () => {
    const p = getPool();
    const pubkey = getPublicKey(secretKey);

    const eventTemplate = {
      kind: NOSTR_KINDS.PAYOUT_TX,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["e", gameId],
        ["txid", payoutTxid],
        ["winner", winnerAddress],
      ],
      content: JSON.stringify({
        payoutTxid,
        winnerAddress,
        timestamp: Date.now(),
      }),
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await Promise.any(
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
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
  await withRetry(async () => {
    const p = getPool();
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
      p.publish(NOSTR_RELAYS as unknown as string[], event)
    );
  });
}

// Subscribe to game session updates
export function subscribeToGameSession(
  gameId: string,
  presenterPubkey: string,
  onEvent: (event: Event) => void
): () => void {
  const p = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.GAME_SESSION],
    authors: [presenterPubkey],
    "#d": [gameId],
  };

  const sub = p.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    filter as import("nostr-tools").Filter,
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
  const p = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.PLAYER_JOIN],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = p.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    filter as import("nostr-tools").Filter,
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
  const p = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.PSBT_FRAGMENT],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = p.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    filter as import("nostr-tools").Filter,
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Subscribe to published PSBT
export function subscribeToPsbtPublish(
  gameId: string,
  onEvent: (event: Event) => void
): () => void {
  const p = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.PSBT_PUBLISH],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = p.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    filter as import("nostr-tools").Filter,
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
  const p = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.GAME_STATE],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = p.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    filter as import("nostr-tools").Filter,
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
  const p = getPool();

  const filter: Filter = {
    kinds: [NOSTR_KINDS.GAME_RESULT],
    "#e": [gameId],
    since: Math.floor(Date.now() / 1000) - 3600,
  };

  const sub = p.subscribeMany(
    NOSTR_RELAYS as unknown as string[],
    filter as import("nostr-tools").Filter,
    {
      onevent: onEvent,
    }
  );

  return () => sub.close();
}

// Augment window with NIP-07 nostr extension type
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: Omit<Event, "sig">): Promise<Event>;
    };
  }
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

// Helper to calculate total pot
function calculateTotalPot(session: GameSession): number {
  return session.players.reduce((sum, p) => sum + p.amount, 0);
}
