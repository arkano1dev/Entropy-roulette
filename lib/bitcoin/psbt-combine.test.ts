import { describe, it, expect } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import {
  SIGHASH_SINGLE_ANYONECANPAY,
  perParticipantFee,
  presenterFee,
  buildParticipantPsbt,
  inspectFragment,
  assembleCoinjoin,
  assertReadyToFinalize,
} from "./psbt-combine";
import { validateAssembledSignatures } from "./psbt-verify";
import { estimateTxSize } from "./psbt-engine";
import type { UTXO } from "@/lib/game/types";

const network = bitcoin.networks.bitcoin;
const ECPair = ECPairFactory(ecc);

// A deterministic P2WPKH participant with a spendable UTXO fixture.
function makeParticipant(seedByte: number, value: number) {
  const kp = ECPair.fromPrivateKey(Buffer.alloc(32, seedByte));
  const { output } = bitcoin.payments.p2wpkh({ pubkey: kp.publicKey, network });
  const utxo: UTXO = {
    txid: Buffer.alloc(32, seedByte).toString("hex"),
    vout: 0,
    value,
    scriptPubKey: Buffer.from(output!).toString("hex"),
  };
  const { address } = bitcoin.payments.p2wpkh({ pubkey: kp.publicKey, network });
  return { kp, utxo, address: address! };
}

// The presenter's own escrow address (where the pot lands).
const escrow = makeParticipant(0xee, 1);
const ESCROW_ADDRESS = escrow.address;

// Sign a participant fragment the way a wallet would: honoring the input's
// SIGHASH_SINGLE|ANYONECANPAY flag.
function signFragment(psbtBase64: string, kp: ReturnType<typeof makeParticipant>["kp"]): string {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  psbt.signInput(0, kp, [SIGHASH_SINGLE_ANYONECANPAY]);
  return psbt.toBase64();
}

describe("fee model — players pay their share", () => {
  it("charges each participant for their own input + output", () => {
    expect(perParticipantFee(10)).toBe(Math.ceil((68 + 43) * 10));
  });

  it("presenter additionally absorbs overhead + OP_RETURN", () => {
    expect(presenterFee(10)).toBeGreaterThan(perParticipantFee(10));
    expect(presenterFee(10, 20)).toBeGreaterThan(presenterFee(10));
  });

  it("sum of participant fees equals the whole-tx fee estimate", () => {
    const feeRate = 12;
    const players = 3; // + 1 presenter = 4 inputs / 4 escrow outputs
    const opBytes = 15;
    const summed = presenterFee(feeRate, opBytes) + players * perParticipantFee(feeRate);
    const whole = estimateTxSize(players + 1, players + 1, opBytes) * feeRate;
    expect(summed).toBe(whole);
  });

  it("escrow output = input value − fee", () => {
    const p = makeParticipant(1, 20000);
    const { escrowValue } = buildParticipantPsbt({
      utxo: p.utxo,
      escrowAddress: ESCROW_ADDRESS,
      feeSats: perParticipantFee(10),
    });
    expect(escrowValue).toBe(20000 - perParticipantFee(10));
  });

  it("rejects a UTXO too small to cover the fee (dust)", () => {
    const tiny = makeParticipant(2, 600);
    expect(() =>
      buildParticipantPsbt({ utxo: tiny.utxo, escrowAddress: ESCROW_ADDRESS, feeSats: perParticipantFee(10) })
    ).toThrow(/dust/i);
  });
});

describe("fragment validation", () => {
  it("accepts a well-formed SINGLE|ANYONECANPAY fragment", () => {
    const p = makeParticipant(3, 30000);
    const frag = signFragment(
      buildParticipantPsbt({ utxo: p.utxo, escrowAddress: ESCROW_ADDRESS, feeSats: perParticipantFee(10) }).psbtBase64,
      p.kp
    );
    const info = inspectFragment(frag, { escrowAddress: ESCROW_ADDRESS });
    expect(info.ok).toBe(true);
    expect(info.outpoint).toBe(`${p.utxo.txid}:0`);
    expect(info.inputValue).toBe(30000);
  });

  it("rejects an unsigned fragment", () => {
    const p = makeParticipant(4, 30000);
    const frag = buildParticipantPsbt({ utxo: p.utxo, escrowAddress: ESCROW_ADDRESS, feeSats: perParticipantFee(10) }).psbtBase64;
    const info = inspectFragment(frag, { escrowAddress: ESCROW_ADDRESS });
    expect(info.ok).toBe(false);
    expect(info.reason).toMatch(/not signed/i);
  });

  it("rejects a fragment signed with SIGHASH_ALL", () => {
    // Build a 1-in/1-out PSBT WITHOUT the coinjoin sighash flag, sign default (ALL).
    const p = makeParticipant(5, 30000);
    const psbt = new bitcoin.Psbt({ network });
    psbt.addInput({
      hash: p.utxo.txid,
      index: 0,
      witnessUtxo: {
        script: Uint8Array.from(Buffer.from(p.utxo.scriptPubKey, "hex")),
        value: BigInt(p.utxo.value),
      },
    });
    psbt.addOutput({ address: ESCROW_ADDRESS, value: BigInt(p.utxo.value - perParticipantFee(10)) });
    psbt.signInput(0, p.kp); // default SIGHASH_ALL
    const info = inspectFragment(psbt.toBase64(), { escrowAddress: ESCROW_ADDRESS });
    expect(info.ok).toBe(false);
    expect(info.reason).toMatch(/sighash/i);
  });

  it("rejects a fragment whose output does not pay escrow", () => {
    const p = makeParticipant(6, 30000);
    const attacker = makeParticipant(7, 1);
    const frag = signFragment(
      buildParticipantPsbt({ utxo: p.utxo, escrowAddress: attacker.address, feeSats: perParticipantFee(10) }).psbtBase64,
      p.kp
    );
    const info = inspectFragment(frag, { escrowAddress: ESCROW_ADDRESS });
    expect(info.ok).toBe(false);
    expect(info.reason).toMatch(/escrow/i);
  });
});

describe("coinjoin assembly", () => {
  function signedFragment(seed: number, value: number) {
    const p = makeParticipant(seed, value);
    const feeSats = seed === 0x10 ? presenterFee(10) : perParticipantFee(10);
    const frag = signFragment(
      buildParticipantPsbt({ utxo: p.utxo, escrowAddress: ESCROW_ADDRESS, feeSats }).psbtBase64,
      p.kp
    );
    return { p, frag, feeSats };
  }

  it("assembles multiple fragments and every signature survives the merge", () => {
    const presenter = signedFragment(0x10, 50000);
    const a = signedFragment(0x11, 30000);
    const b = signedFragment(0x12, 40000);

    const res = assembleCoinjoin([presenter.frag, a.frag, b.frag], { escrowAddress: ESCROW_ADDRESS });
    expect(res.includedCount).toBe(3);
    expect(res.perParticipant.every((p) => p.included)).toBe(true);
    expect(res.totalInput).toBe(50000 + 30000 + 40000);
    expect(res.fee).toBe(presenter.feeSats + a.feeSats + b.feeSats);

    // The crux: signatures made over separate txs are valid in the merged tx.
    expect(validateAssembledSignatures(res.psbtBase64).valid).toBe(true);

    assertReadyToFinalize(res.psbtBase64);
    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network });
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    expect(tx.ins.length).toBe(3);
    expect(tx.outs.length).toBe(3);
  });

  it("appends OP_RETURN as a trailing output without breaking signatures", () => {
    const a = signedFragment(0x21, 30000);
    const b = signedFragment(0x22, 30000);
    const res = assembleCoinjoin([a.frag, b.frag], {
      escrowAddress: ESCROW_ADDRESS,
      opReturnData: "entropy-roulette-test",
    });
    expect(res.includedCount).toBe(2);
    expect(validateAssembledSignatures(res.psbtBase64).valid).toBe(true);
    const psbt = bitcoin.Psbt.fromBase64(res.psbtBase64, { network });
    expect(psbt.txOutputs.length).toBe(3); // 2 escrow + 1 OP_RETURN
    expect(psbt.txOutputs[2].script[0]).toBe(bitcoin.opcodes.OP_RETURN);
  });

  it("drops duplicate outpoints, keeping the first", () => {
    const a = signedFragment(0x31, 30000);
    const res = assembleCoinjoin([a.frag, a.frag], { escrowAddress: ESCROW_ADDRESS });
    expect(res.includedCount).toBe(1);
    expect(res.rejected.some((r) => /duplicate/i.test(r.reason))).toBe(true);
    expect(validateAssembledSignatures(res.psbtBase64).valid).toBe(true);
  });

  it("drops an invalid (SIGHASH_ALL) fragment but keeps the valid ones", () => {
    const good = signedFragment(0x41, 30000);
    // A SIGHASH_ALL fragment
    const bad = makeParticipant(0x42, 30000);
    const badPsbt = new bitcoin.Psbt({ network });
    badPsbt.addInput({
      hash: bad.utxo.txid,
      index: 0,
      witnessUtxo: {
        script: Uint8Array.from(Buffer.from(bad.utxo.scriptPubKey, "hex")),
        value: BigInt(bad.utxo.value),
      },
    });
    badPsbt.addOutput({ address: ESCROW_ADDRESS, value: BigInt(bad.utxo.value - perParticipantFee(10)) });
    badPsbt.signInput(0, bad.kp);

    const res = assembleCoinjoin([good.frag, badPsbt.toBase64()], { escrowAddress: ESCROW_ADDRESS });
    expect(res.includedCount).toBe(1);
    expect(res.rejected.length).toBe(1);
    expect(validateAssembledSignatures(res.psbtBase64).valid).toBe(true);
  });

  it("assertReadyToFinalize throws listing unsigned inputs", () => {
    // Assemble a valid one, then hand-craft a PSBT with an unsigned input.
    const psbt = new bitcoin.Psbt({ network });
    const p = makeParticipant(0x51, 30000);
    psbt.addInput({
      hash: p.utxo.txid,
      index: 0,
      witnessUtxo: {
        script: Uint8Array.from(Buffer.from(p.utxo.scriptPubKey, "hex")),
        value: BigInt(p.utxo.value),
      },
    });
    psbt.addOutput({ address: ESCROW_ADDRESS, value: BigInt(29000) });
    expect(() => assertReadyToFinalize(psbt.toBase64())).toThrow(/unsigned/i);
  });

  it("chains a Tx 2 payout spending the finalized escrow outputs", () => {
    // Assemble + finalize Tx 1.
    const presenter = signedFragment(0x10, 50000);
    const a = signedFragment(0x11, 30000);
    const res = assembleCoinjoin([presenter.frag, a.frag], { escrowAddress: ESCROW_ADDRESS });
    const psbt1 = bitcoin.Psbt.fromBase64(res.psbtBase64, { network });
    psbt1.finalizeAllInputs();
    const tx1hex = psbt1.extractTransaction().toHex();

    // Build Tx 2 from Tx 1's raw hex (mirrors the build-payout API handler).
    const parsed = bitcoin.Transaction.fromHex(tx1hex);
    const txid1 = parsed.getId();
    const escrowScript = Buffer.from(bitcoin.address.toOutputScript(ESCROW_ADDRESS, network));
    const psbt2 = new bitcoin.Psbt({ network });
    let total = BigInt(0);
    let count = 0;
    parsed.outs.forEach((out, vout) => {
      const script = Buffer.from(out.script);
      if (script[0] === bitcoin.opcodes.OP_RETURN) return;
      if (!script.equals(escrowScript)) return;
      psbt2.addInput({
        hash: txid1,
        index: vout,
        witnessUtxo: { script: Uint8Array.from(script), value: BigInt(out.value) },
      });
      total += BigInt(out.value);
      count++;
    });
    expect(count).toBe(2); // presenter escrow + player escrow

    const fee = BigInt(estimateTxSize(count, 1) * 3);
    const winner = makeParticipant(0x99, 1);
    psbt2.addOutput({ address: winner.address, value: total - fee });

    // The presenter controls the escrow address → signs every Tx 2 input.
    for (let i = 0; i < count; i++) psbt2.signInput(i, escrow.kp);
    const valid = psbt2.validateSignaturesOfAllInputs((pk, mh, sig) => ecc.verify(mh, pk, sig));
    expect(valid).toBe(true);
    psbt2.finalizeAllInputs();
    const tx2 = psbt2.extractTransaction();
    expect(tx2.ins.length).toBe(2);
    expect(tx2.outs.length).toBe(1);
  });

  it("works with a single presenter fragment (zero players)", () => {
    const presenter = signedFragment(0x10, 50000);
    const res = assembleCoinjoin([presenter.frag], { escrowAddress: ESCROW_ADDRESS });
    expect(res.includedCount).toBe(1);
    expect(validateAssembledSignatures(res.psbtBase64).valid).toBe(true);
    assertReadyToFinalize(res.psbtBase64);
  });
});
