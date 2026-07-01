// Signature verification for assembled coinjoin PSBTs.
//
// Kept in a separate module from psbt-combine.ts because it pulls in the ECC
// backend (@bitcoinerlab/secp256k1). Import this ONLY from server code (the API
// route) or tests — never from client components, to keep the browser bundle
// free of the secp256k1 wasm.

import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";

const network = bitcoin.networks.bitcoin;

const validator = (
  pubkey: Uint8Array,
  msghash: Uint8Array,
  signature: Uint8Array
): boolean => ecc.verify(msghash, pubkey, signature);

/**
 * Verify that every input of an assembled PSBT carries a cryptographically
 * valid signature over the final transaction. This is the gate that proves the
 * SINGLE|ANYONECANPAY signatures survived being spliced together.
 */
export function validateAssembledSignatures(
  psbtBase64: string
): { valid: boolean; error?: string } {
  try {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
    const valid = psbt.validateSignaturesOfAllInputs(validator);
    return { valid };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}
