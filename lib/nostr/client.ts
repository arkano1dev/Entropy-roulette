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

// ---------------------------------------------------------------------------
// Publish diagnostics — surface per-relay accept/reject so a silent relay
// rejection (like the earlier bad-`e`-tag bug) is immediately visible.
// ---------------------------------------------------------------------------

export interface PublishReport {
  label: string; // human-readable kind, e.g. "player-join"
  accepted: string[]; // relay URLs that acknowledged the event
  rejected: { relay: string; error: string }[];
  total: number;
}

type PublishReporter = (report: PublishReport) => void;
let publishReporter: PublishReporter | null = null;

/** Register a callback to observe every publish result (e.g. log to the UI). */
export function setPublishReporter(fn: PublishReporter | null): void {
  publishReporter = fn;
}

const KIND_LABEL: Record<number, string> = {
  [NOSTR_KINDS.GAME_SESSION]: "game-session",
  [NOSTR_KINDS.PLAYER_JOIN]: "player-join",
  [NOSTR_KINDS.PSBT_FRAGMENT]: "psbt-fragment",
  [NOSTR_KINDS.GAME_STATE]: "game-state",
  [NOSTR_KINDS.GAME_RESULT]: "game-result",
  [NOSTR_KINDS.PSBT_PUBLISH]: "psbt-publish",
  [NOSTR_KINDS.PAYOUT_TX]: "payout-tx",
};

/**
 * Publish an event to all relays, awaiting each result. Reports per-relay
 * accept/reject (console + optional reporter) and throws only if EVERY relay
 * rejected — so `withRetry` still retries a total failure, but partial success
 * (the normal case) proceeds while remaining visible.
 */
async function publishEvent(pool: SimplePool, event: Event): Promise<PublishReport> {
  const relays = NOSTR_RELAYS as unknown as string[];
  const results = await Promise.allSettled(pool.publish(relays, event));

  const accepted: string[] = [];
  const rejected: { relay: string; error: string }[] = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      accepted.push(relays[i]);
    } else {
      rejected.push({
        relay: relays[i],
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  });

  const report: PublishReport = {
    label: KIND_LABEL[event.kind] ?? `kind-${event.kind}`,
    accepted,
    rejected,
    total: relays.length,
  };

  if (rejected.length > 0) {
    console.warn(
      `[nostr] ${report.label}: ${accepted.length}/${relays.length} relays accepted; rejected —`,
      rejected
    );
  }
  publishReporter?.(report);

  if (accepted.length === 0) {
    throw new Error(
      `All relays rejected ${report.label}: ${rejected
        .map((r) => `${r.relay} (${r.error})`)
        .join("; ")}`
    );
  }
  return report;
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
    await publishEvent(p, event);
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
        ["t", gameId],
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
    await publishEvent(p, event);
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
        ["t", gameId],
        ["p", pubkey],
        ["playerId", playerId],
      ],
      content: signedPsbt,
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await publishEvent(p, event);
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
      tags: [["t", gameId]],
      content: psbtBase64,
      pubkey,
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await publishEvent(p, event);
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
      ["t", gameId],
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
    await publishEvent(p, event);
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
        ["t", gameId],
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
    await publishEvent(p, event);
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
        ["t", gameId],
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
    await publishEvent(p, event);
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
    "#t": [gameId],
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
    "#t": [gameId],
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
    "#t": [gameId],
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
    "#t": [gameId],
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
    "#t": [gameId],
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
