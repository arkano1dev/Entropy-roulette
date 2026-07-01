"use client";

// THROWAWAY SPIKE — verify Xverse will sign an input with
// SIGHASH_SINGLE | ANYONECANPAY (0x83), the sighash the coinjoin combiner needs.
//
// It builds a real 1-in/1-out PSBT from one of your UTXOs (paying back to your
// OWN address) and asks Xverse to sign it. NOTHING is broadcast. If the returned
// signature's trailing sighash byte is 0x83, the coinjoin flow is viable.
//
// Delete this route once the result is confirmed.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { connectXverseWallet, signPsbtWithXverse } from "@/lib/bitcoin/sats-connect";
import { getSpendableUTXO } from "@/lib/bitcoin/mempool-api";
import {
  buildParticipantPsbt,
  inspectFragment,
  perParticipantFee,
  SIGHASH_SINGLE_ANYONECANPAY,
} from "@/lib/bitcoin/psbt-combine";

type Log = { kind: "info" | "ok" | "fail"; msg: string };

export default function SpikePage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<"pass" | "fail" | null>(null);

  const add = (kind: Log["kind"], msg: string) => setLogs((l) => [...l, { kind, msg }]);

  const run = async () => {
    setLogs([]);
    setVerdict(null);
    setBusy(true);
    try {
      add("info", "Connecting Xverse…");
      const wallet = await connectXverseWallet();
      add("ok", `Connected: ${wallet.address}`);

      const feeRate = 5;
      const feeSats = perParticipantFee(feeRate);
      add("info", `Fetching a spendable UTXO (need > ${feeSats + 546} sats for a valid output)…`);
      const utxo = await getSpendableUTXO(wallet.address, feeSats + 1000);
      add("ok", `UTXO ${utxo.txid.slice(0, 12)}…:${utxo.vout} = ${utxo.value.toLocaleString()} sats`);

      add("info", "Building 1-in/1-out PSBT with sighashType 0x83 (SINGLE|ANYONECANPAY)…");
      const { psbtBase64, escrowValue } = buildParticipantPsbt({
        utxo,
        escrowAddress: wallet.address, // pay back to self — never broadcast
        feeSats,
      });
      add("info", `Output back to self: ${escrowValue.toLocaleString()} sats`);

      add("info", "Requesting signature from Xverse (review it, then approve)…");
      const signed = await signPsbtWithXverse(psbtBase64, { [wallet.address]: [0] }, false);
      add("ok", "Xverse returned a signed PSBT.");

      const info = inspectFragment(signed, { escrowAddress: wallet.address });
      if (info.ok) {
        add("ok", `✓ Signature uses SIGHASH_SINGLE|ANYONECANPAY (0x${SIGHASH_SINGLE_ANYONECANPAY.toString(16)}).`);
        add("ok", "PASS — Xverse honors the coinjoin sighash. The flow is viable.");
        setVerdict("pass");
      } else {
        add("fail", `✗ ${info.reason}`);
        add("fail", "FAIL — Xverse did not honor SINGLE|ANYONECANPAY. Fall back to the shared-base model.");
        setVerdict("fail");
      }
    } catch (err) {
      add("fail", err instanceof Error ? err.message : String(err));
      setVerdict("fail");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-card border border-border rounded-lg p-6 space-y-4">
        <div>
          <h1 className="font-mono text-xl text-neon">Xverse Sighash Spike</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1 leading-relaxed">
            Confirms Xverse will sign with SIGHASH_SINGLE | ANYONECANPAY (0x83). Signs a real UTXO paying
            back to your own address. Nothing is broadcast.
          </p>
        </div>

        <Button
          onClick={run}
          disabled={busy}
          className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
          size="lg"
        >
          {busy ? "RUNNING…" : "RUN SPIKE"}
        </Button>

        {verdict && (
          <div
            className={`rounded-lg p-3 font-mono text-sm text-center ${
              verdict === "pass"
                ? "bg-neon/10 border border-neon/40 text-neon"
                : "bg-glitch/10 border border-glitch/40 text-glitch"
            }`}
          >
            {verdict === "pass" ? "PASS ✓" : "FAIL ✗"}
          </div>
        )}

        <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-1 max-h-80 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">Logs will appear here…</p>
          ) : (
            logs.map((l, i) => (
              <p
                key={i}
                className={`font-mono text-xs break-all ${
                  l.kind === "ok" ? "text-neon" : l.kind === "fail" ? "text-glitch" : "text-muted-foreground"
                }`}
              >
                {l.msg}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
