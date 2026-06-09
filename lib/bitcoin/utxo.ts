// UTXO provider for Entropy Roulette
// Fetches UTXOs via internal /api/utxos route (backed by Unisat API)
// Adapted from brc20kit (https://github.com/arkano1dev/brc20kit)

import type { UTXO } from "@/lib/game/types";

export interface UTXODiscoveryResult {
  utxos: UTXO[];
  totalBalance: number;
  hasEnough: boolean;
  required: number;
}

/**
 * Fetch UTXOs for an address via the internal /api/utxos route.
 * The route is backed by Unisat API and returns scriptPubKey for each UTXO,
 * which is required for proper PSBT construction (from brc20kit pattern).
 */
export async function discoverUTXOs(
  address: string,
  requiredSats = 0
): Promise<UTXODiscoveryResult> {
  const response = await fetch("/api/utxos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `UTXO fetch failed (${response.status}): ${err.error ?? response.statusText}`
    );
  }

  const data = await response.json();

  if (!data.success || !Array.isArray(data.data)) {
    throw new Error(data.error ?? "Invalid UTXO response");
  }

  const utxos: UTXO[] = data.data;
  const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0);

  return {
    utxos,
    totalBalance,
    hasEnough: totalBalance >= requiredSats,
    required: requiredSats,
  };
}

/**
 * Select the best single UTXO for a given required amount + fee buffer.
 * Prefers the smallest UTXO that covers the requirement (avoids change waste).
 */
export function selectBestUTXO(
  utxos: UTXO[],
  requiredSats: number,
  feeBuffer = 10000
): UTXO | null {
  const needed = requiredSats + feeBuffer;

  const candidates = utxos
    .filter((u) => u.value >= needed)
    .sort((a, b) => a.value - b.value);

  if (candidates.length > 0) return candidates[0];

  // Fall back to largest available
  return [...utxos].sort((a, b) => b.value - a.value)[0] ?? null;
}

export function formatUTXO(utxo: UTXO): string {
  return `${utxo.txid.slice(0, 8)}...:${utxo.vout} — ${utxo.value.toLocaleString()} sats`;
}
