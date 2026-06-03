// PSBT Engine for Entropy Roulette
// Handles PSBT creation, combination, and finalization

import * as bitcoin from "bitcoinjs-lib";
import type { UTXO, Player } from "@/lib/game/types";

// Use Mainnet
const network = bitcoin.networks.bitcoin;

export interface PSBTInput {
  txid: string;
  vout: number;
  value: number;
  witnessUtxo: {
    script: Buffer;
    value: bigint;
  };
}

export interface PSBTOutput {
  address: string;
  value: bigint;
}

// Create a new PSBT with the winner output
export function createBasePsbt(winnerAddress: string): string {
  const psbt = new bitcoin.Psbt({ network });

  // Add a placeholder output - actual value will be set after all inputs are added
  psbt.addOutput({
    address: winnerAddress,
    value: BigInt(0), // Will be updated
  });

  return psbt.toBase64();
}

// Add an input to the PSBT from a player's UTXO
export function addInputToPsbt(
  psbtBase64: string,
  utxo: UTXO,
  inputScript: Buffer
): string {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: inputScript,
      value: BigInt(utxo.value),
    },
  });

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

  // Start with the first PSBT
  const combined = psbts[0];

  // Combine signatures from other PSBTs
  for (let i = 1; i < psbts.length; i++) {
    combined.combine(psbts[i]);
  }

  return combined.toBase64();
}

// Update the output value based on total inputs minus fee
export function updateOutputValue(
  psbtBase64: string,
  totalInputSats: number,
  feeSats: number
): string {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  const outputValue = BigInt(totalInputSats - feeSats);

  if (outputValue <= BigInt(0)) {
    throw new Error("Output value must be positive after fees");
  }

  // Create a new PSBT with updated output
  const newPsbt = new bitcoin.Psbt({ network });

  // Copy inputs
  psbt.data.inputs.forEach((input, index) => {
    const txInput = psbt.txInputs[index];
    newPsbt.addInput({
      hash: txInput.hash,
      index: txInput.index,
      witnessUtxo: input.witnessUtxo,
      partialSig: input.partialSig,
      finalScriptWitness: input.finalScriptWitness,
    });
  });

  // Add output with correct value
  const originalOutput = psbt.txOutputs[0];
  newPsbt.addOutput({
    address: bitcoin.address.fromOutputScript(originalOutput.script, network),
    value: outputValue,
  });

  return newPsbt.toBase64();
}

// Finalize all inputs and extract the raw transaction
export function finalizePsbt(psbtBase64: string): {
  finalizedPsbt: string;
  rawTx: string;
  txid: string;
} {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  // Finalize all inputs
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

  // Get the last byte of the TXID (first 2 chars since txid is reversed)
  const lastByte = parseInt(txid.slice(-2), 16);
  const winnerIndex = lastByte % playerCount;

  return {
    winnerIndex,
    entropyByte: lastByte,
    calculation: `0x${txid.slice(-2).toUpperCase()} (${lastByte}) % ${playerCount} = ${winnerIndex}`,
  };
}

// Estimate transaction size for fee calculation
export function estimateTxSize(inputCount: number): number {
  // P2WPKH inputs: ~68 vbytes each
  // P2WPKH output: ~31 vbytes
  // Overhead: ~10 vbytes
  return 10 + inputCount * 68 + 31;
}

// Calculate required fee in sats
export function calculateFee(inputCount: number, feeRate: number): number {
  const vsize = estimateTxSize(inputCount);
  return Math.ceil(vsize * feeRate);
}

// Generate a BIP-21 URI for signing
export function generateBip21Uri(
  address: string,
  psbtBase64: string,
  label?: string
): string {
  const params = new URLSearchParams();
  params.set("psbt", psbtBase64);
  if (label) {
    params.set("label", label);
  }
  return `bitcoin:${address}?${params.toString()}`;
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
  inputs: Array<{ txid: string; vout: number; value: bigint }>;
  outputs: Array<{ address: string; value: bigint }>;
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

  const outputs = psbt.txOutputs.map((output) => ({
    address: bitcoin.address.fromOutputScript(output.script, network),
    value: output.value,
  }));

  const totalInputValue = inputs.reduce((sum, i) => sum + i.value, BigInt(0));
  const totalOutputValue = outputs.reduce((sum, o) => sum + o.value, BigInt(0));

  return {
    inputCount: inputs.length,
    outputCount: outputs.length,
    totalInputValue,
    totalOutputValue,
    fee: totalInputValue - totalOutputValue,
    inputs,
    outputs,
  };
}

// Build unified PSBT from all players
export function buildUnifiedPsbt(
  players: Player[],
  winnerAddress: string,
  feeRate: number
): string {
  const psbt = new bitcoin.Psbt({ network });

  let totalInput = BigInt(0);

  // Add all player inputs
  players.forEach((player) => {
    if (player.utxo) {
      psbt.addInput({
        hash: player.utxo.txid,
        index: player.utxo.vout,
        witnessUtxo: {
          script: Buffer.from(player.utxo.scriptPubKey, "hex"),
          value: BigInt(player.utxo.value),
        },
      });
      totalInput += BigInt(player.utxo.value);
    }
  });

  // Calculate fee
  const fee = BigInt(calculateFee(players.length, feeRate));
  const outputValue = totalInput - fee;

  if (outputValue <= BigInt(0)) {
    throw new Error("Insufficient funds for fee");
  }

  // Single output to winner
  psbt.addOutput({
    address: winnerAddress,
    value: outputValue,
  });

  return psbt.toBase64();
}
