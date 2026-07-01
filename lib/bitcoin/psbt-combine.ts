// Coinjoin-style PSBT combiner for Entropy Roulette.
//
// Unlike BIP-174 `Psbt.combine()` (which only merges partial signatures over an
// identical global transaction), this module ASSEMBLES one transaction out of
// many independently-built, independently-signed single-input PSBTs — the way a
// coinjoin / ordinal-swap is put together.
//
// The construction is only valid because every participant signs their input
// with SIGHASH_SINGLE | SIGHASH_ANYONECANPAY (0x83):
//   - ANYONECANPAY  → the signature commits to ONLY that participant's own input
//   - SINGLE        → it commits to ONLY the one output at the same index
// So as long as we append each participant's input AND their output as a pair at
// the same index, the signature stays valid no matter who else joins the tx.
//
// Fee model: each participant pays for their own input + output. The presenter
// (input #0) additionally absorbs the shared tx overhead and any OP_RETURN.

import * as bitcoin from "bitcoinjs-lib";
import { addressToScript, buildOpReturnScript } from "./psbt-engine";
import type { UTXO } from "@/lib/game/types";

const network = bitcoin.networks.bitcoin;

/** SIGHASH_SINGLE | SIGHASH_ANYONECANPAY = 0x83 = 131. The coinjoin sighash. */
export const SIGHASH_SINGLE_ANYONECANPAY =
  bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY;

// vbyte constants — kept consistent with estimateTxSize() in psbt-engine.ts
export const INPUT_VBYTES = 68;
export const OUTPUT_VBYTES = 43;
export const TX_OVERHEAD_VBYTES = 10;
export const DUST_LIMIT = 546;

/** Fee a single participant pays: their own input + their own output. */
export function perParticipantFee(feeRate: number): number {
  return Math.ceil((INPUT_VBYTES + OUTPUT_VBYTES) * feeRate);
}

/**
 * Fee the presenter (input #0) pays: their own input/output share PLUS the
 * shared transaction overhead and the OP_RETURN output (if any). This makes the
 * sum of every participant's implied fee equal the whole transaction's fee.
 */
export function presenterFee(feeRate: number, opReturnBytes = 0): number {
  const opReturn = opReturnBytes > 0 ? 10 + opReturnBytes : 0;
  return perParticipantFee(feeRate) + Math.ceil((TX_OVERHEAD_VBYTES + opReturn) * feeRate);
}

export interface ParticipantPsbtResult {
  psbtBase64: string;
  /** Value of the escrow output = input value − fee. */
  escrowValue: number;
  fee: number;
}

/**
 * Build a single participant's 1-input / 1-output PSBT:
 *   input  = their UTXO, flagged SIGHASH_SINGLE|ANYONECANPAY
 *   output = the escrow address, value = input value − feeSats
 * This is what each player (and the presenter) signs in their own wallet.
 */
export function buildParticipantPsbt(params: {
  utxo: UTXO;
  escrowAddress: string;
  feeSats: number;
}): ParticipantPsbtResult {
  const { utxo, escrowAddress, feeSats } = params;
  const escrowValue = utxo.value - feeSats;
  if (escrowValue <= DUST_LIMIT) {
    throw new Error(
      `Escrow output below dust after fee: ${escrowValue} sats ` +
        `(input ${utxo.value} − fee ${feeSats}). Bet a larger UTXO or lower the fee rate.`
    );
  }

  const psbt = new bitcoin.Psbt({ network });
  const scriptBuf = Buffer.from(utxo.scriptPubKey, "hex");
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    sequence: 0xfffffffd, // RBF
    sighashType: SIGHASH_SINGLE_ANYONECANPAY,
    witnessUtxo: {
      script: Uint8Array.from(scriptBuf),
      value: BigInt(utxo.value),
    },
  });

  const escrowScript = addressToScript(escrowAddress);
  if (escrowScript) {
    psbt.addOutput({ script: Uint8Array.from(escrowScript), value: BigInt(escrowValue) });
  } else {
    psbt.addOutput({ address: escrowAddress, value: BigInt(escrowValue) });
  }

  return { psbtBase64: psbt.toBase64(), escrowValue, fee: feeSats };
}

export interface FragmentInfo {
  ok: boolean;
  reason?: string;
  outpoint?: string; // "txid:vout" (display byte order)
  inputValue?: number;
  escrowValue?: number;
}

/**
 * Validate a single participant fragment before it is spliced into the coinjoin:
 *   - parses as a PSBT with exactly one input and one output
 *   - the input carries a partial signature
 *   - that signature uses SIGHASH_SINGLE|ANYONECANPAY (checked on the sig's
 *     trailing byte, which survives wallet round-trips even if the PSBT's
 *     sighashType field is stripped)
 *   - the single output pays the expected escrow address
 */
export function inspectFragment(
  fragmentB64: string,
  opts: { escrowAddress: string }
): FragmentInfo {
  let psbt: bitcoin.Psbt;
  try {
    psbt = bitcoin.Psbt.fromBase64(fragmentB64, { network });
  } catch {
    return { ok: false, reason: "unparseable PSBT" };
  }

  if (psbt.txInputs.length !== 1) {
    return { ok: false, reason: `expected 1 input, got ${psbt.txInputs.length}` };
  }
  if (psbt.txOutputs.length !== 1) {
    return { ok: false, reason: `expected 1 output, got ${psbt.txOutputs.length}` };
  }

  const txIn = psbt.txInputs[0];
  const input = psbt.data.inputs[0];
  const outpoint = `${Buffer.from(txIn.hash).reverse().toString("hex")}:${txIn.index}`;

  const partialSig = input.partialSig?.[0]?.signature;
  if (!partialSig) {
    return { ok: false, reason: "input is not signed", outpoint };
  }
  // The DER signature's last byte is the sighash flag. This is authoritative.
  const sigHashByte = partialSig[partialSig.length - 1];
  if (sigHashByte !== SIGHASH_SINGLE_ANYONECANPAY) {
    return {
      ok: false,
      reason: `wrong sighash 0x${sigHashByte.toString(16)} (need 0x${SIGHASH_SINGLE_ANYONECANPAY.toString(
        16
      )} SINGLE|ANYONECANPAY)`,
      outpoint,
    };
  }

  const out = psbt.txOutputs[0];
  const escrowScript = addressToScript(opts.escrowAddress);
  const paysEscrow = escrowScript
    ? Buffer.from(out.script).equals(Buffer.from(escrowScript))
    : out.address === opts.escrowAddress;
  if (!paysEscrow) {
    return { ok: false, reason: "output does not pay the escrow address", outpoint };
  }

  return {
    ok: true,
    outpoint,
    inputValue: input.witnessUtxo ? Number(input.witnessUtxo.value) : undefined,
    escrowValue: Number(out.value),
  };
}

export interface ParticipantStatus {
  outpoint: string;
  included: boolean;
  reason?: string;
  inputValue?: number;
  escrowValue?: number;
}

export interface AssembleResult {
  psbtBase64: string;
  perParticipant: ParticipantStatus[];
  includedCount: number;
  rejected: Array<{ outpoint?: string; reason: string }>;
  totalInput: number;
  totalEscrow: number;
  fee: number;
}

/**
 * Assemble many participant fragments into one coinjoin PSBT.
 *
 * Each valid fragment contributes its input and its output at the SAME index,
 * preserving the pairing that keeps every SINGLE|ANYONECANPAY signature valid.
 * Duplicate outpoints and invalid fragments are dropped (with reasons) rather
 * than aborting the whole assembly. An optional OP_RETURN is appended as a
 * trailing output — no participant's SINGLE signature commits to it.
 */
export function assembleCoinjoin(
  fragments: string[],
  opts: { escrowAddress: string; opReturnData?: string }
): AssembleResult {
  const psbt = new bitcoin.Psbt({ network });
  const seen = new Set<string>();
  const perParticipant: ParticipantStatus[] = [];
  const rejected: Array<{ outpoint?: string; reason: string }> = [];
  let totalInput = 0;
  let totalEscrow = 0;

  for (const frag of fragments) {
    const info = inspectFragment(frag, { escrowAddress: opts.escrowAddress });
    if (!info.ok) {
      rejected.push({ outpoint: info.outpoint, reason: info.reason! });
      perParticipant.push({ outpoint: info.outpoint ?? "?", included: false, reason: info.reason });
      continue;
    }
    if (seen.has(info.outpoint!)) {
      rejected.push({ outpoint: info.outpoint, reason: "duplicate outpoint" });
      perParticipant.push({ outpoint: info.outpoint!, included: false, reason: "duplicate outpoint" });
      continue;
    }
    seen.add(info.outpoint!);

    const src = bitcoin.Psbt.fromBase64(frag, { network });
    const txIn = src.txInputs[0];
    const inData = src.data.inputs[0];
    const out = src.txOutputs[0];

    // Append input then output → both land at the same new index.
    psbt.addInput({
      hash: txIn.hash,
      index: txIn.index,
      sequence: txIn.sequence,
      sighashType: SIGHASH_SINGLE_ANYONECANPAY,
      witnessUtxo: inData.witnessUtxo,
    });
    psbt.updateInput(psbt.inputCount - 1, { partialSig: inData.partialSig });
    psbt.addOutput({ script: out.script, value: out.value });

    totalInput += info.inputValue ?? 0;
    totalEscrow += info.escrowValue ?? 0;
    perParticipant.push({
      outpoint: info.outpoint!,
      included: true,
      inputValue: info.inputValue,
      escrowValue: info.escrowValue,
    });
  }

  const opReturn = opts.opReturnData?.trim();
  if (opReturn) {
    psbt.addOutput({ script: Uint8Array.from(buildOpReturnScript(opReturn)), value: BigInt(0) });
  }

  return {
    psbtBase64: psbt.toBase64(),
    perParticipant,
    includedCount: seen.size,
    rejected,
    totalInput,
    totalEscrow,
    fee: totalInput - totalEscrow,
  };
}

/**
 * Throw a clear error if any input of an assembled PSBT lacks a signature,
 * instead of letting `finalizeAllInputs()` fail with an opaque message.
 */
export function assertReadyToFinalize(psbtBase64: string): void {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  if (psbt.inputCount === 0) throw new Error("Nothing to finalize: PSBT has no inputs");
  const unsigned: number[] = [];
  psbt.data.inputs.forEach((inp, i) => {
    const signed = (inp.partialSig?.length ?? 0) > 0 || inp.finalScriptWitness != null;
    if (!signed) unsigned.push(i);
  });
  if (unsigned.length > 0) {
    throw new Error(`Cannot finalize: inputs ${unsigned.join(", ")} are unsigned`);
  }
}
