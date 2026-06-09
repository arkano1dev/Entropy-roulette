// PSBT Engine for Entropy Roulette
// Patterns adapted from brc20kit (https://github.com/arkano1dev/brc20kit)
// Key insight: scriptPubKey must come from Unisat API (scriptPk field),
// and be passed as Uint8Array.from(Buffer) for bitcoinjs-lib v7 compatibility.

import * as bitcoin from "bitcoinjs-lib";
import type { UTXO, Player } from "@/lib/game/types";

const network = bitcoin.networks.bitcoin;

// ----- Types -----

export interface PSBTBuildResult {
  psbtBase64: string;
  psbtHex: string;
  inputCount: number;
  outputCount: number;
  estimatedFee: number;
}

// ----- Address helpers (from brc20kit) -----

/**
 * Decode a Bitcoin address to scriptPubKey buffer.
 * Works for P2WPKH (bc1q...), P2PKH (1...), P2SH (3...).
 * Taproot (bc1p...) requires scriptPk from Unisat API directly.
 */
export function addressToScript(address: string): Buffer | null {
  try {
    if (address.startsWith("bc1p") || address.startsWith("tb1p")) return null;
    return Buffer.from(bitcoin.address.toOutputScript(address, network));
  } catch {
    return null;
  }
}

// ----- OP_RETURN helpers (from brc20kit) -----

/**
 * Build an OP_RETURN output script from arbitrary data.
 * Supports any string: plain text, JSON, game metadata, etc.
 * Bitcoin protocol maximum: 80 bytes.
 */
export function buildOpReturnScript(data: string): Buffer {
  const dataBuffer = Buffer.from(data, "utf8");
  if (dataBuffer.length > 80) {
    throw new Error(`OP_RETURN data too large: ${dataBuffer.length} bytes (max 80)`);
  }
  return Buffer.from(bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, dataBuffer]));
}

// ----- Fee calculation -----

export function estimateTxSize(
  inputCount: number,
  outputCount: number,
  opReturnDataBytes = 0
): number {
  return (
    10 +
    inputCount * 68 +
    outputCount * 43 +
    (opReturnDataBytes > 0 ? 10 + opReturnDataBytes : 0)
  );
}

export function calculateFee(
  inputCount: number,
  outputCount: number,
  feeRate: number,
  opReturnDataBytes = 0
): number {
  return Math.ceil(estimateTxSize(inputCount, outputCount, opReturnDataBytes) * feeRate);
}

// ----- Core PSBT Builders -----

/**
 * Build the initial game PSBT:
 *  - One input per player UTXO (scriptPubKey from Unisat API)
 *  - Optional OP_RETURN output (arbitrary text — NOT BRC-20 specific)
 *  - One escrow output to presenter address (all funds)
 *
 * "More players = more signatures": each player must sign their own input
 * before the presenter can combine and finalize.
 */
export function buildGamePsbt(
  players: Player[],
  escrowAddress: string,
  feeRate: number,
  opReturnData?: string
): PSBTBuildResult {
  const psbt = new bitcoin.Psbt({ network });
  let totalInput = BigInt(0);

  for (const player of players) {
    if (!player.utxo) continue;
    // brc20kit pattern: Buffer.from(hex) → Uint8Array.from(buf) for v7
    const scriptBuf = Buffer.from(player.utxo.scriptPubKey, "hex");
    psbt.addInput({
      hash: player.utxo.txid,
      index: player.utxo.vout,
      sequence: 0xfffffffd, // RBF enabled
      witnessUtxo: {
        script: Uint8Array.from(scriptBuf),
        value: BigInt(player.utxo.value),
      },
    });
    totalInput += BigInt(player.utxo.value);
  }

  if (psbt.inputCount === 0) throw new Error("No valid player inputs");

  const opBytes = opReturnData ? Buffer.from(opReturnData, "utf8").length : 0;
  const outputCount = opReturnData ? 2 : 1;
  const fee = BigInt(calculateFee(psbt.inputCount, outputCount, feeRate, opBytes));
  const escrowValue = totalInput - fee;

  if (escrowValue <= BigInt(546))
    throw new Error(`Insufficient funds after fee: ${escrowValue} sats`);

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

/**
 * Add a single player's input + output to an existing PSBT.
 * Used in the collaborative signing flow where each player
 * adds their own UTXO and a receiving output, then signs.
 */
export function addPlayerToPsbt(
  psbtBase64: string,
  utxo: UTXO,
  playerReceivingAddress: string,
  playerContribution: number
): string {
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

  if (playerContribution > 546) {
    const recvScript = addressToScript(playerReceivingAddress);
    if (recvScript) {
      psbt.addOutput({ script: Uint8Array.from(recvScript), value: BigInt(playerContribution) });
    } else {
      psbt.addOutput({ address: playerReceivingAddress, value: BigInt(playerContribution) });
    }
  }

  return psbt.toBase64();
}

// Build escrow PSBT (Tx 1): all player inputs → presenter escrow
export function buildEscrowPsbt(players: Player[], escrowAddress: string, feeRate: number): string {
  return buildGamePsbt(players, escrowAddress, feeRate).psbtBase64;
}

// Build payout PSBT (Tx 2): escrow UTXO → winner
export function buildPayoutPsbt(
  escrowTxid: string,
  escrowVout: number,
  escrowValue: number,
  escrowAddress: string,
  winnerAddress: string,
  feeRate: number
): string {
  const psbt = new bitcoin.Psbt({ network });
  const escrowScript = addressToScript(escrowAddress);

  psbt.addInput({
    hash: escrowTxid,
    index: escrowVout,
    sequence: 0xfffffffd,
    witnessUtxo: escrowScript
      ? { script: Uint8Array.from(escrowScript), value: BigInt(escrowValue) }
      : {
          script: Uint8Array.from(bitcoin.address.toOutputScript(escrowAddress, network)),
          value: BigInt(escrowValue),
        },
  });

  const fee = BigInt(calculateFee(1, 1, feeRate));
  const outputValue = BigInt(escrowValue) - fee;
  if (outputValue <= BigInt(0)) throw new Error("Escrow value too small for payout fee");

  const winnerScript = addressToScript(winnerAddress);
  if (winnerScript) {
    psbt.addOutput({ script: Uint8Array.from(winnerScript), value: outputValue });
  } else {
    psbt.addOutput({ address: winnerAddress, value: outputValue });
  }

  return psbt.toBase64();
}

// Combine multiple partially-signed PSBTs into one
export function combinePsbts(psbtBase64Array: string[]): string {
  if (!psbtBase64Array.length) throw new Error("No PSBTs to combine");
  const psbts = psbtBase64Array.map((b) => bitcoin.Psbt.fromBase64(b, { network }));
  const base = psbts[0];
  for (let i = 1; i < psbts.length; i++) base.combine(psbts[i]);
  return base.toBase64();
}

// Finalize all inputs and extract raw transaction hex
export function finalizePsbt(psbtBase64: string): { finalizedPsbt: string; rawTx: string; txid: string } {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { finalizedPsbt: psbt.toBase64(), rawTx: tx.toHex(), txid: tx.getId() };
}

// Determine winner from txid entropy (last byte % playerCount)
export function calculateWinner(
  txid: string,
  playerCount: number
): { winnerIndex: number; entropyByte: number; calculation: string } {
  if (playerCount <= 0) throw new Error("Player count must be positive");
  const lastByte = parseInt(txid.slice(-2), 16);
  const winnerIndex = lastByte % playerCount;
  return {
    winnerIndex,
    entropyByte: lastByte,
    calculation: `0x${txid.slice(-2).toUpperCase()} (${lastByte}) % ${playerCount} = ${winnerIndex}`,
  };
}

/**
 * Alias for decodePsbt — used by PSBTInspector component.
 * Returns rich decode data including inputs, outputs, fee, and OP_RETURN.
 */
export function getPsbtDetails(psbtBase64: string) {
  return decodePsbt(psbtBase64);
}

// Decode a PSBT for inspection
export function decodePsbt(psbtBase64: string) {
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
    const script = Buffer.from(out.script);
    const isOpReturn = script[0] === bitcoin.opcodes.OP_RETURN;
    let opReturnText: string | undefined;
    if (isOpReturn && script.length > 2) {
      try { opReturnText = script.slice(2).toString("utf8"); }
      catch { opReturnText = script.slice(2).toString("hex"); }
    }
    return { address: isOpReturn ? null : out.address, value: Number(out.value), isOpReturn, opReturnText };
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
