// PSBT Engine for Entropy Roulette
// Handles PSBT creation, combination, finalization, OP_RETURN, and multi-player signing
// Patterns adapted from brc20kit (https://github.com/arkano1dev/brc20kit)

import * as bitcoin from "bitcoinjs-lib";
import type { UTXO, Player } from "@/lib/game/types";

// Use Mainnet
const network = bitcoin.networks.bitcoin;

// ----- Types -----

export interface PSBTBuildResult {
  psbtBase64: string;
  psbtHex: string;
  inputCount: number;
  outputCount: number;
  estimatedFee: number;
}

export interface PlayerInput {
  playerId: string;
  address: string;
  utxo: UTXO;
}

// ----- Address helpers (adapted from brc20kit) -----

/**
 * Decode a Bitcoin address to its scriptPubKey buffer.
 * Works for P2WPKH (bc1q...), P2PKH (1...), P2SH (3...).
 * Taproot (bc1p...) addresses must supply scriptPubKey via the UTXO directly.
 */
function addressToScript(address: string): Buffer | null {
  try {
    if (address.startsWith("bc1p") || address.startsWith("tb1p")) {
      // Taproot requires ECC — caller must supply scriptPubKey in UTXO
      return null;
    }
    const script = bitcoin.address.toOutputScript(address, network);
    return Buffer.from(script);
  } catch {
    return null;
  }
}

// ----- OP_RETURN helpers (from brc20kit) -----

/**
 * Build an OP_RETURN output script from arbitrary data.
 * Data can be any string (JSON, plain text, hex, etc.).
 * Max 80 bytes per Bitcoin protocol.
 */
export function buildOpReturnScript(data: string): Buffer {
  const dataBuffer = Buffer.from(data, "utf8");
  if (dataBuffer.length > 80) {
    throw new Error(
      `OP_RETURN data too large: ${dataBuffer.length} bytes (max 80)`
    );
  }
  return Buffer.from(
    bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, dataBuffer])
  );
}

// ----- Fee calculation (adapted from brc20kit) -----

/**
 * Estimate transaction virtual size in bytes.
 * P2WPKH input: ~68 vbytes, P2TR input: ~57.5 vbytes (use 68 as safe estimate).
 * P2WPKH output: ~31 vbytes, OP_RETURN output: ~10 + data bytes.
 */
export function estimateTxSize(
  inputCount: number,
  outputCount: number,
  opReturnDataBytes = 0
): number {
  const base = 10;
  const inputs = inputCount * 68;
  const outputs = outputCount * 43;
  const opReturn = opReturnDataBytes > 0 ? 10 + opReturnDataBytes : 0;
  return base + inputs + outputs + opReturn;
}

export function calculateFee(
  inputCount: number,
  outputCount: number,
  feeRate: number,
  opReturnDataBytes = 0
): number {
  return Math.ceil(
    estimateTxSize(inputCount, outputCount, opReturnDataBytes) * feeRate
  );
}

// ----- Core PSBT Builders -----

/**
 * Build the initial game PSBT:
 * - One input per player (their UTXO)
 * - Optional OP_RETURN (custom message from presenter)
 * - One output per player (their receiving address, minus fee share)
 * - Escrow output to presenter address
 *
 * This is the "escrow" transaction: all players contribute inputs and
 * the net goes to the presenter escrow. Winner payout is Tx 2.
 */
export function buildGamePsbt(
  players: Player[],
  escrowAddress: string,
  feeRate: number,
  opReturnData?: string
): PSBTBuildResult {
  const psbt = new bitcoin.Psbt({ network });

  let totalInput = BigInt(0);

  // Add each player's input
  for (const player of players) {
    if (!player.utxo) continue;

    const scriptBuf = Buffer.from(player.utxo.scriptPubKey, "hex");

    psbt.addInput({
      hash: player.utxo.txid,
      index: player.utxo.vout,
      sequence: 0xfffffffd, // Enable RBF
      witnessUtxo: {
        script: Uint8Array.from(scriptBuf),
        value: BigInt(player.utxo.value),
      },
    });

    totalInput += BigInt(player.utxo.value);
  }

  if (psbt.inputCount === 0) {
    throw new Error("No valid player inputs to build PSBT");
  }

  const outputCount = opReturnData ? 2 : 1; // OP_RETURN + escrow
  const opReturnBytes = opReturnData
    ? Buffer.from(opReturnData, "utf8").length
    : 0;
  const fee = BigInt(
    calculateFee(psbt.inputCount, outputCount, feeRate, opReturnBytes)
  );
  const escrowValue = totalInput - fee;

  if (escrowValue <= BigInt(546)) {
    throw new Error(
      `Insufficient funds after fee: ${escrowValue} sats (minimum 546)`
    );
  }

  // Add OP_RETURN output first (if provided)
  if (opReturnData) {
    const opReturnScript = buildOpReturnScript(opReturnData);
    psbt.addOutput({
      script: Uint8Array.from(opReturnScript),
      value: BigInt(0),
    });
  }

  // Add escrow output (all funds → presenter)
  const escrowScript = addressToScript(escrowAddress);
  if (escrowScript) {
    psbt.addOutput({
      script: Uint8Array.from(escrowScript),
      value: escrowValue,
    });
  } else {
    // Fallback: let bitcoinjs handle the address directly
    psbt.addOutput({ address: escrowAddress, value: escrowValue });
  }

  const psbtBase64 = psbt.toBase64();
  const psbtHex = Buffer.from(psbtBase64, "base64").toString("hex");

  return {
    psbtBase64,
    psbtHex,
    inputCount: psbt.inputCount,
    outputCount: psbt.txOutputs.length,
    estimatedFee: Number(fee),
  };
}

/**
 * Add a single player's input + output to an existing PSBT.
 * Used for the multi-player "join" flow: each player adds their own
 * contribution to the transaction being built collaboratively.
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

  // Add output back to this player (their bet amount minus fee share)
  // The caller calculates the net amount
  if (playerContribution > 546) {
    const receivingScript = addressToScript(playerReceivingAddress);
    if (receivingScript) {
      psbt.addOutput({
        script: Uint8Array.from(receivingScript),
        value: BigInt(playerContribution),
      });
    } else {
      psbt.addOutput({
        address: playerReceivingAddress,
        value: BigInt(playerContribution),
      });
    }
  }

  return psbt.toBase64();
}

// Build PSBT for Transaction 1: all player inputs → single escrow output (legacy API)
export function buildEscrowPsbt(
  players: Player[],
  escrowAddress: string,
  feeRate: number
): string {
  return buildGamePsbt(players, escrowAddress, feeRate).psbtBase64;
}

// Build PSBT for Transaction 2: payout from escrow to winner
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
      ? {
          script: Uint8Array.from(escrowScript),
          value: BigInt(escrowValue),
        }
      : {
          script: Uint8Array.from(
            bitcoin.address.toOutputScript(escrowAddress, network)
          ),
          value: BigInt(escrowValue),
        },
  });

  const fee = BigInt(calculateFee(1, 1, feeRate));
  const outputValue = BigInt(escrowValue) - fee;

  if (outputValue <= BigInt(0)) {
    throw new Error("Escrow value too small for payout fee");
  }

  const winnerScript = addressToScript(winnerAddress);
  if (winnerScript) {
    psbt.addOutput({
      script: Uint8Array.from(winnerScript),
      value: outputValue,
    });
  } else {
    psbt.addOutput({ address: winnerAddress, value: outputValue });
  }

  return psbt.toBase64();
}

// Combine multiple signed PSBTs into one
export function combinePsbts(psbtBase64Array: string[]): string {
  if (psbtBase64Array.length === 0) {
    throw new Error("No PSBTs to combine");
  }

  const psbts = psbtBase64Array.map((base64) =>
    bitcoin.Psbt.fromBase64(base64, { network })
  );

  const combined = psbts[0];
  for (let i = 1; i < psbts.length; i++) {
    combined.combine(psbts[i]);
  }

  return combined.toBase64();
}

// Finalize all inputs and extract the raw transaction
export function finalizePsbt(psbtBase64: string): {
  finalizedPsbt: string;
  rawTx: string;
  txid: string;
} {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();

  return {
    finalizedPsbt: psbt.toBase64(),
    rawTx: tx.toHex(),
    txid: tx.getId(),
  };
}

// Calculate the winner based on TXID entropy
export function calculateWinner(
  txid: string,
  playerCount: number
): {
  winnerIndex: number;
  entropyByte: number;
  calculation: string;
} {
  if (playerCount <= 0) {
    throw new Error("Player count must be positive");
  }

  const lastByte = parseInt(txid.slice(-2), 16);
  const winnerIndex = lastByte % playerCount;

  return {
    winnerIndex,
    entropyByte: lastByte,
    calculation: `0x${txid.slice(-2).toUpperCase()} (${lastByte}) % ${playerCount} = ${winnerIndex}`,
  };
}

// Validate a PSBT structure
export function validatePsbt(psbtBase64: string): {
  valid: boolean;
  inputCount: number;
  outputCount: number;
  error?: string;
} {
  try {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    return {
      valid: true,
      inputCount: psbt.inputCount,
      outputCount: psbt.txOutputs.length,
    };
  } catch (error) {
    return {
      valid: false,
      inputCount: 0,
      outputCount: 0,
      error: error instanceof Error ? error.message : "Invalid PSBT",
    };
  }
}

// Get PSBT details for display
export function getPsbtDetails(psbtBase64: string): {
  inputCount: number;
  outputCount: number;
  totalInputValue: bigint;
  totalOutputValue: bigint;
  fee: bigint;
  hasOpReturn: boolean;
  opReturnData?: string;
  inputs: Array<{ txid: string; vout: number; value: bigint }>;
  outputs: Array<{ address?: string; value: bigint; isOpReturn: boolean; opReturnText?: string }>;
} {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  const inputs = psbt.data.inputs.map((input, index) => {
    const txInput = psbt.txInputs[index];
    return {
      txid: Buffer.from(txInput.hash).reverse().toString("hex"),
      vout: txInput.index,
      value: input.witnessUtxo?.value ?? BigInt(0),
    };
  });

  const outputs = psbt.txOutputs.map((output) => {
    const isOpReturn = output.script[0] === bitcoin.opcodes.OP_RETURN;
    let opReturnText: string | undefined;
    if (isOpReturn && output.script.length > 2) {
      try {
        // Skip OP_RETURN (0x6a) and push opcode byte
        opReturnText = output.script.slice(2).toString("utf8");
      } catch {
        opReturnText = output.script.slice(2).toString("hex");
      }
    }
    return {
      address: isOpReturn ? undefined : output.address,
      value: output.value,
      isOpReturn,
      opReturnText,
    };
  });

  const totalInputValue = inputs.reduce((sum, i) => sum + i.value, BigInt(0));
  const totalOutputValue = outputs
    .filter((o) => !o.isOpReturn)
    .reduce((sum, o) => sum + o.value, BigInt(0));
  const hasOpReturn = outputs.some((o) => o.isOpReturn);
  const opReturnData = outputs.find((o) => o.isOpReturn)?.opReturnText;

  return {
    inputCount: inputs.length,
    outputCount: outputs.length,
    totalInputValue,
    totalOutputValue,
    fee: totalInputValue - totalOutputValue,
    hasOpReturn,
    opReturnData,
    inputs,
    outputs,
  };
}

// Add an input to the PSBT from a player's UTXO (legacy API)
export function addInputToPsbt(
  psbtBase64: string,
  utxo: UTXO,
  inputScript: Buffer
): string {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    sequence: 0xfffffffd,
    witnessUtxo: {
      script: Uint8Array.from(inputScript),
      value: BigInt(utxo.value),
    },
  });

  return psbt.toBase64();
}

// Build unified PSBT from all players (legacy — use buildGamePsbt)
export function buildUnifiedPsbt(
  players: Player[],
  winnerAddress: string,
  feeRate: number
): string {
  return buildEscrowPsbt(players, winnerAddress, feeRate);
}
