// POST /api/utxos — Fetch UTXOs for a Bitcoin address via Unisat API
// Adapted from brc20kit (https://github.com/arkano1dev/brc20kit)
// Returns scriptPubKey per UTXO, required for real PSBT construction

import { type NextRequest, NextResponse } from "next/server";

interface UnisatUTXO {
  address: string;
  satoshi: number;
  scriptPk: string;
  scriptType: string;
  txid: string;
  vout: number;
  height: number;
  inscriptions: unknown[];
}

interface UnisatResponse {
  code: number;
  msg: string;
  data: {
    cursor: number;
    total: number;
    utxo: UnisatUTXO[];
  };
}

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "address is required" },
        { status: 400 }
      );
    }

    const apiToken = process.env.UNISAT_API_TOKEN;
    const apiUrl =
      process.env.UNISAT_API_URL || "https://open-api.unisat.io";

    if (!apiToken) {
      // Graceful degradation: fall back to mempool.space (fetches scriptPubKey per tx)
      return await fetchMempoolFallback(address);
    }

    // Fetch all pages from Unisat (handles pagination)
    const allUTXOs: UnisatUTXO[] = [];
    let cursor = 0;
    const pageSize = 100;

    for (let page = 0; page < 10; page++) {
      const url = `${apiUrl}/v1/indexer/address/${address}/available-utxo-data?cursor=${cursor}&size=${pageSize}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 30 }, // cache 30s
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Unisat API ${res.status}: ${txt}`);
      }

      const data: UnisatResponse = await res.json();

      if (data.code !== 0) {
        throw new Error(`Unisat error: ${data.msg} (code ${data.code})`);
      }

      allUTXOs.push(...data.data.utxo);

      const hasMore =
        data.data.utxo.length === pageSize &&
        data.data.cursor < data.data.total;

      if (!hasMore) break;
      cursor = data.data.cursor;
    }

    // Map to our UTXO format — scriptPk → scriptPubKey is the key brc20kit pattern
    const utxos = allUTXOs
      .filter((u) => u.scriptPk) // scriptPubKey is required for PSBT
      .map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.satoshi,
        scriptPubKey: u.scriptPk,
        address: u.address || address,
      }));

    return NextResponse.json({
      success: true,
      data: utxos,
      total: utxos.length,
      provider: "unisat",
    });
  } catch (err) {
    console.error("[api/utxos]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Fallback UTXO provider using mempool.space.
 * Fetches scriptPubKey from each tx output — slower but no API key needed.
 * Adapted from brc20kit approach of always including scriptPubKey for PSBT.
 */
async function fetchMempoolFallback(address: string): Promise<NextResponse> {
  try {
    const res = await fetch(
      `https://mempool.space/api/address/${encodeURIComponent(address)}/utxo`
    );
    if (!res.ok) throw new Error(`mempool.space error (${res.status})`);

    const raw = (await res.json()) as Array<{
      txid: string;
      vout: number;
      value: number;
      status: { confirmed: boolean };
    }>;

    // Fetch scriptPubKey for each UTXO from the raw transaction
    const utxos = await Promise.all(
      raw.slice(0, 20).map(async (u) => {
        try {
          const txRes = await fetch(`https://mempool.space/api/tx/${u.txid}`);
          const tx = (await txRes.json()) as {
            vout: Array<{ scriptpubkey: string }>;
          };
          const scriptPubKey = tx.vout[u.vout]?.scriptpubkey ?? "";
          return { txid: u.txid, vout: u.vout, value: u.value, scriptPubKey };
        } catch {
          return { txid: u.txid, vout: u.vout, value: u.value, scriptPubKey: "" };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: utxos.filter((u) => u.scriptPubKey),
      total: utxos.length,
      provider: "mempool.space",
      note: "Set UNISAT_API_TOKEN env var for faster UTXO fetching with full pagination.",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Fallback failed" },
      { status: 500 }
    );
  }
}
