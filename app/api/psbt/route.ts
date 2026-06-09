// POST /api/psbt — PSBT operations: build, add-player, combine, finalize, broadcast
// Backed by bitcoinjs-lib using brc20kit patterns

import { type NextRequest, NextResponse } from "next/server";
import * as bitcoin from "bitcoinjs-lib";

const network = bitcoin.networks.bitcoin;

function addressToScript(address: string): Buffer | null {
  try {
    if (address.startsWith("bc1p") || address.startsWith("tb1p")) return null;
    return Buffer.from(bitcoin.address.toOutputScript(address, network));
  } catch {
    return null;
  }
}

function buildOpReturnScript(data: string): Buffer {
  const buf = Buffer.from(data, "utf8");
  if (buf.length > 80) throw new Error(`OP_RETURN data too large: ${buf.length} bytes (max 80)`);
  return Buffer.from(bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, buf]));
}

function estimateFee(
  inputCount: number,
  outputCount: number,
  feeRate: number,
  opReturnBytes = 0
): number {
  const size =
    10 +
    inputCount * 68 +
    outputCount * 43 +
    (opReturnBytes > 0 ? 10 + opReturnBytes : 0);
  return Math.ceil(size * feeRate);
}

// ---- Action handlers ----

function handleBuild(body: Record<string, unknown>) {
  const {
    players,
    escrowAddress,
    feeRate = 10,
    opReturnData,
  } = body as {
    players: Array<{
      utxo: { txid: string; vout: number; value: number; scriptPubKey: string };
    }>;
    escrowAddress: string;
    feeRate?: number;
    opReturnData?: string;
  };

  if (!players?.length) throw new Error("players array is required");
  if (!escrowAddress) throw new Error("escrowAddress is required");

  const psbt = new bitcoin.Psbt({ network });
  let totalInput = BigInt(0);

  for (const p of players) {
    if (!p.utxo) continue;
    const scriptBuf = Buffer.from(p.utxo.scriptPubKey, "hex");
    psbt.addInput({
      hash: p.utxo.txid,
      index: p.utxo.vout,
      sequence: 0xfffffffd,
      witnessUtxo: {
        script: Uint8Array.from(scriptBuf),
        value: BigInt(p.utxo.value),
      },
    });
    totalInput += BigInt(p.utxo.value);
  }

  if (psbt.inputCount === 0) throw new Error("No valid inputs");

  const outputCount = opReturnData ? 2 : 1;
  const opBytes = opReturnData ? Buffer.from(opReturnData, "utf8").length : 0;
  const fee = BigInt(estimateFee(psbt.inputCount, outputCount, Number(feeRate), opBytes));
  const escrowValue = totalInput - fee;

  if (escrowValue < BigInt(546)) {
    throw new Error(`Insufficient funds after fee: ${escrowValue} sats`);
  }

  if (opReturnData) {
    const opScript = buildOpReturnScript(opReturnData);
    psbt.addOutput({ script: Uint8Array.from(opScript), value: BigInt(0) });
  }

  const escrowScript = addressToScript(escrowAddress);
  if (escrowScript) {
    psbt.addOutput({ script: Uint8Array.from(escrowScript), value: escrowValue });
  } else {
    psbt.addOutput({ address: escrowAddress, value: escrowValue });
  }

  const psbtBase64 = psbt.toBase64();
  return {
    psbtBase64,
    psbtHex: Buffer.from(psbtBase64, "base64").toString("hex"),
    inputCount: psbt.inputCount,
    outputCount: psbt.txOutputs.length,
    estimatedFee: Number(fee),
  };
}

function handleAddPlayer(body: Record<string, unknown>) {
  const { psbtBase64, utxo, receivingAddress, contributionSats } = body as {
    psbtBase64: string;
    utxo: { txid: string; vout: number; value: number; scriptPubKey: string };
    receivingAddress: string;
    contributionSats?: number;
  };

  if (!psbtBase64) throw new Error("psbtBase64 is required");
  if (!utxo) throw new Error("utxo is required");
  if (!receivingAddress) throw new Error("receivingAddress is required");

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  const scriptBuf = Buffer.from(utxo.scriptPubKey, "hex");

  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    sequence: 0xfffffffd,
    witnessUtxo: {
      script: Uint8Array.from(scriptBuf),
      value: BigInt(utxo.value),
    },
  });

  const contrib = contributionSats ?? utxo.value;
  if (contrib > 546) {
    const recvScript = addressToScript(receivingAddress);
    if (recvScript) {
      psbt.addOutput({ script: Uint8Array.from(recvScript), value: BigInt(contrib) });
    } else {
      psbt.addOutput({ address: receivingAddress, value: BigInt(contrib) });
    }
  }

  const updated = psbt.toBase64();
  return {
    psbtBase64: updated,
    psbtHex: Buffer.from(updated, "base64").toString("hex"),
    inputCount: psbt.inputCount,
    outputCount: psbt.txOutputs.length,
  };
}

function handleCombine(body: Record<string, unknown>) {
  const { psbts } = body as { psbts: string[] };
  if (!psbts?.length) throw new Error("psbts array is required");

  const parsed = psbts.map((b) => bitcoin.Psbt.fromBase64(b, { network }));
  const combined = parsed[0];
  for (let i = 1; i < parsed.length; i++) combined.combine(parsed[i]);

  const result = combined.toBase64();
  return {
    psbtBase64: result,
    psbtHex: Buffer.from(result, "base64").toString("hex"),
    inputCount: combined.inputCount,
    outputCount: combined.txOutputs.length,
  };
}

function handleFinalize(body: Record<string, unknown>) {
  const { psbtBase64 } = body as { psbtBase64: string };
  if (!psbtBase64) throw new Error("psbtBase64 is required");

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();

  return {
    finalizedPsbt: psbt.toBase64(),
    rawTx: tx.toHex(),
    txid: tx.getId(),
  };
}

async function handleBroadcast(body: Record<string, unknown>) {
  const { rawTx } = body as { rawTx: string };
  if (!rawTx) throw new Error("rawTx is required");

  const res = await fetch("https://mempool.space/api/tx", {
    method: "POST",
    body: rawTx,
    headers: { "Content-Type": "text/plain" },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Broadcast failed (${res.status}): ${errText}`);
  }

  const txid = await res.text();
  return { txid: txid.trim() };
}

function handleDecode(body: Record<string, unknown>) {
  const { psbtBase64 } = body as { psbtBase64: string };
  if (!psbtBase64) throw new Error("psbtBase64 is required");

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  const inputs = psbt.data.inputs.map((inp, i) => {
    const txIn = psbt.txInputs[i];
    return {
      txid: Buffer.from(txIn.hash).reverse().toString("hex"),
      vout: txIn.index,
      value: inp.witnessUtxo ? Number(inp.witnessUtxo.value) : null,
      signed: (inp.partialSig?.length ?? 0) > 0 || inp.finalScriptWitness != null,
    };
  });

  const outputs = psbt.txOutputs.map((out) => {
    const isOpReturn = out.script[0] === bitcoin.opcodes.OP_RETURN;
    let opReturnText: string | undefined;
    if (isOpReturn && out.script.length > 2) {
      try {
        opReturnText = out.script.slice(2).toString("utf8");
      } catch {
        opReturnText = out.script.slice(2).toString("hex");
      }
    }
    return {
      address: isOpReturn ? null : out.address,
      value: Number(out.value),
      isOpReturn,
      opReturnText,
    };
  });

  const totalIn = inputs.reduce((s, i) => s + (i.value ?? 0), 0);
  const totalOut = outputs.filter((o) => !o.isOpReturn).reduce((s, o) => s + o.value, 0);

  return {
    inputCount: inputs.length,
    outputCount: outputs.length,
    totalInputSats: totalIn,
    totalOutputSats: totalOut,
    feeSats: totalIn - totalOut,
    hasOpReturn: outputs.some((o) => o.isOpReturn),
    opReturnData: outputs.find((o) => o.isOpReturn)?.opReturnText,
    inputs,
    outputs,
    psbtBase64,
    psbtHex: Buffer.from(psbtBase64, "base64").toString("hex"),
  };
}

// ---- Main route handler ----

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    if (!action) {
      return NextResponse.json({ success: false, error: "action is required" }, { status: 400 });
    }

    let result: unknown;

    switch (action) {
      case "build":
        result = handleBuild(body);
        break;
      case "add-player":
        result = handleAddPlayer(body);
        break;
      case "combine":
        result = handleCombine(body);
        break;
      case "finalize":
        result = handleFinalize(body);
        break;
      case "broadcast":
        result = await handleBroadcast(body);
        break;
      case "decode":
        result = handleDecode(body);
        break;
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[api/psbt]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
