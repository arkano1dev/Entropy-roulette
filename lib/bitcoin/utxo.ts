"use client";

// UTXO discovery via mempool.space API
import { getAddressUTXOs } from "./mempool-api";
import type { MempoolUTXO } from "./mempool-api";

export interface DiscoveredUTXO {
  txid: string;
  vout: number;
  value: number; // sats
  scriptPubKey: string;
  confirmed: boolean;
}

export interface UTXODiscoveryResult {
  utxos: DiscoveredUTXO[];
  totalBalance: number;
  hasEnough: boolean;
  required: number;
}

// Fetch and normalize UTXOs for an address
export async function discoverUTXOs(
  address: string,
  requiredSats: number = 0
): Promise<UTXODiscoveryResult> {
  try {
    const mempoolUtxos = await getAddressUTXOs(address);

    // Convert mempool UTXOs to our format
    // We need the scriptPubKey — for P2WPKH/P2TR we can derive it from the address
    const utxos: DiscoveredUTXO[] = mempoolUtxos.map((u: MempoolUTXO) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      scriptPubKey: deriveScriptPubKey(address),
      confirmed: u.status?.confirmed ?? false,
    }));

    const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0);

    return {
      utxos,
      totalBalance,
      hasEnough: totalBalance >= requiredSats,
      required: requiredSats,
    };
  } catch (err) {
    throw new Error(
      `UTXO discovery failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// Derive scriptPubKey from address (best-effort for common types)
function deriveScriptPubKey(address: string): string {
  if (address.startsWith("bc1q")) {
    // P2WPKH - 00 14 <20 bytes>
    // We don't have a full decoder here, so return a placeholder.
    // In production, the wallet should provide the actual scriptPubKey
    // when connecting. For now we use a placeholder that will be replaced.
    return "0014" + "0".repeat(40);
  }
  if (address.startsWith("bc1p")) {
    // P2TR - 51 20 <32 bytes>
    return "5120" + "0".repeat(64);
  }
  if (address.startsWith("3")) {
    // P2SH
    return "a914" + "0".repeat(40);
  }
  if (address.startsWith("1")) {
    // P2PKH
    return "76a914" + "0".repeat(40) + "88ac";
  }
  return "";
}

// Select the best UTXO(s) for a given bet amount + fee buffer
export function selectBestUTXO(
  utxos: DiscoveredUTXO[],
  requiredSats: number,
  feeBuffer: number = 10000
): DiscoveredUTXO | null {
  const needed = requiredSats + feeBuffer;

  // Prefer a single UTXO that's just big enough (smallest that covers)
  const candidates = utxos
    .filter((u) => u.value >= needed)
    .sort((a, b) => a.value - b.value);

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Otherwise pick the largest (player may need to add more inputs manually later)
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  return sorted[0] ?? null;
}

// Format UTXO for display
export function formatUTXO(utxo: DiscoveredUTXO): string {
  return `${utxo.txid.slice(0, 8)}...:${utxo.vout} — ${utxo.value.toLocaleString()} sats`;
}
