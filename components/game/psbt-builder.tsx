"use client";

// PSBT Builder for Entropy Roulette — Presenter side
// Adapted from brc20kit patterns:
//  - Real bitcoinjs-lib PSBT via /api/psbt
//  - OP_RETURN with arbitrary text (not BRC-20 specific)
//  - Multi-player signing: each player adds their input/output then signs
//  - Presenter can combine all fragments, finalize, and broadcast

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Player } from "@/lib/game/types";

interface PsbtBuilderProps {
  players: Player[];
  presenterAddress: string;
  feeRate: number;
  /** OP_RETURN text set by the presenter at game creation — always embedded. */
  opReturnText: string;
  onPsbtBuilt: (psbtBase64: string) => void;
  onFinalized: (rawTx: string, txid: string) => void;
}

interface BuildState {
  psbtBase64: string | null;
  psbtHex: string | null;
  inputCount: number;
  outputCount: number;
  estimatedFee: number;
  hasOpReturn: boolean;
  opReturnData?: string;
  totalInputSats: number;
  totalOutputSats: number;
}

export function PsbtBuilder({
  players,
  presenterAddress,
  feeRate,
  opReturnText,
  onPsbtBuilt,
  onFinalized,
}: PsbtBuilderProps) {
  const [buildState, setBuildState] = useState<BuildState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<
    "build" | "inspect" | "finalize" | "broadcast"
  >("build");

  // --- Build the initial PSBT ---
  const handleBuild = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      const res = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "build",
          players: players.map((p) => ({ utxo: p.utxo })),
          escrowAddress: presenterAddress,
          feeRate,
          opReturnData: opReturnText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const result = data.data;

      // Decode to inspect
      const decRes = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decode", psbtBase64: result.psbtBase64 }),
      });
      const decData = await decRes.json();
      const decoded = decData.success ? decData.data : null;

      setBuildState({
        psbtBase64: result.psbtBase64,
        psbtHex: result.psbtHex,
        inputCount: result.inputCount,
        outputCount: result.outputCount,
        estimatedFee: result.estimatedFee,
        hasOpReturn: decoded?.hasOpReturn ?? false,
        opReturnData: decoded?.opReturnData,
        totalInputSats: decoded?.totalInputSats ?? 0,
        totalOutputSats: decoded?.totalOutputSats ?? 0,
      });

      onPsbtBuilt(result.psbtBase64);
      setStep("inspect");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [players, presenterAddress, feeRate, opReturnText, onPsbtBuilt]);

  // --- Finalize: combine available signed fragments, then extract raw tx ---
  const handleFinalize = useCallback(async () => {
    if (!buildState?.psbtBase64) return;
    setError(null);
    setIsBusy(true);
    try {
      const signedFragments = players
        .map((p) => p.signedPsbt)
        .filter((s): s is string => Boolean(s));

      // Combine base PSBT + all signed fragments (if any)
      let combinedBase64 = buildState.psbtBase64;
      if (signedFragments.length > 0) {
        const allPsbts = [buildState.psbtBase64, ...signedFragments];
        const combineRes = await fetch("/api/psbt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "combine", psbts: allPsbts }),
        });
        const combineData = await combineRes.json();
        if (!combineData.success) throw new Error(combineData.error);
        combinedBase64 = combineData.data.psbtBase64;
      }

      // Finalize all inputs and extract raw transaction
      const finalRes = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", psbtBase64: combinedBase64 }),
      });
      const finalData = await finalRes.json();
      if (!finalData.success) throw new Error(finalData.error);

      const { rawTx, txid } = finalData.data;
      setBuildState((prev) =>
        prev ? { ...prev, psbtBase64: finalData.data.finalizedPsbt } : prev
      );
      onFinalized(rawTx, txid);
      setStep("broadcast");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [buildState, players, onFinalized]);

  const playersWithUtxo = players.filter((p) => p.utxo);
  const signedCount = players.filter((p) => p.signedPsbt).length;
  const allSigned = signedCount === players.length && players.length > 0;

  return (
    <div className="space-y-4">
      {/* --- Step: Build --- */}
      {step === "build" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* OP_RETURN — read-only, set at game creation */}
          <div className="bg-neon/5 border border-neon/20 rounded-lg p-3">
            <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">
              OP_RETURN (set at game creation)
            </div>
            <div className="font-mono text-xs text-neon break-all leading-relaxed">
              {opReturnText || <span className="text-muted-foreground italic">none</span>}
            </div>
          </div>

          {/* Player inputs summary */}
          <div className="bg-muted/20 border border-border rounded-lg p-4">
            <div className="font-mono text-sm text-neon mb-3">INPUTS</div>
            {playersWithUtxo.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                No players have UTXOs yet
              </p>
            ) : (
              <div className="space-y-2">
                {playersWithUtxo.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between font-mono text-xs"
                  >
                    <span className="text-muted-foreground">
                      {p.displayName}
                    </span>
                    <span className="text-neon">
                      {p.utxo!.value.toLocaleString()} sats
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground px-1">
            <span>Fee rate: {feeRate} sat/vB</span>
            <span>Escrow: {presenterAddress.slice(0, 16)}...</span>
          </div>

          <Button
            onClick={handleBuild}
            disabled={isBusy || playersWithUtxo.length === 0}
            className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
            size="lg"
          >
            {isBusy ? "BUILDING..." : "BUILD PSBT"}
          </Button>
        </motion.div>
      )}

      {/* --- Step: Inspect --- */}
      {step === "inspect" && buildState && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3">
            <div className="font-mono text-sm text-neon mb-2">PSBT BUILT</div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-background/40 rounded p-2">
                <div className="text-muted-foreground">Inputs</div>
                <div className="text-neon text-lg">{buildState.inputCount}</div>
              </div>
              <div className="bg-background/40 rounded p-2">
                <div className="text-muted-foreground">Outputs</div>
                <div className="text-neon text-lg">{buildState.outputCount}</div>
              </div>
              <div className="bg-background/40 rounded p-2">
                <div className="text-muted-foreground">Fee</div>
                <div className="text-neon">{buildState.estimatedFee.toLocaleString()} sats</div>
              </div>
              <div className="bg-background/40 rounded p-2">
                <div className="text-muted-foreground">OP_RETURN</div>
                <div className={buildState.hasOpReturn ? "text-neon" : "text-muted-foreground"}>
                  {buildState.hasOpReturn ? "YES" : "NO"}
                </div>
              </div>
            </div>

            {buildState.hasOpReturn && buildState.opReturnData && (
              <div className="bg-neon/5 border border-neon/20 rounded p-2">
                <div className="font-mono text-xs text-muted-foreground mb-1">
                  OP_RETURN CONTENT
                </div>
                <div className="font-mono text-xs text-neon break-all">
                  {buildState.opReturnData}
                </div>
              </div>
            )}

            {/* PSBT hex (scrollable, copyable) */}
            <div className="space-y-1">
              <div className="font-mono text-xs text-muted-foreground">
                PSBT HEX (share with signers)
              </div>
              <div
                className="bg-background/60 border border-border rounded p-2 font-mono text-xs text-muted-foreground break-all overflow-y-auto max-h-24 cursor-pointer hover:border-neon/30 transition-colors"
                onClick={() => {
                  if (buildState.psbtHex) {
                    navigator.clipboard.writeText(buildState.psbtHex);
                  }
                }}
                title="Click to copy"
              >
                {buildState.psbtHex}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                Click hex to copy
              </div>
            </div>

            {/* Base64 */}
            <div className="space-y-1">
              <div className="font-mono text-xs text-muted-foreground">
                PSBT BASE64 (for Xverse / sats-connect)
              </div>
              <div
                className="bg-background/60 border border-border rounded p-2 font-mono text-xs text-muted-foreground break-all overflow-y-auto max-h-20 cursor-pointer hover:border-neon/30 transition-colors"
                onClick={() => {
                  if (buildState.psbtBase64) {
                    navigator.clipboard.writeText(buildState.psbtBase64);
                  }
                }}
                title="Click to copy"
              >
                {buildState.psbtBase64}
              </div>
            </div>
          </div>

          {/* Signature progress */}
          <div className="bg-muted/20 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-neon">SIGNATURES</span>
              <Badge
                variant={allSigned ? "default" : "secondary"}
                className="font-mono text-xs"
              >
                {signedCount}/{players.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between font-mono text-xs"
                >
                  <span className="text-muted-foreground">{p.displayName}</span>
                  <span className={p.signedPsbt ? "text-neon" : "text-muted-foreground"}>
                    {p.signedPsbt ? "SIGNED" : "PENDING"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="font-mono"
              onClick={() => {
                setBuildState(null);
                setStep("build");
              }}
            >
              REBUILD
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={isBusy || !allSigned}
              className="flex-1 bg-neon text-background hover:bg-neon/80 font-mono disabled:opacity-50"
            >
              {isBusy
                ? "FINALIZING..."
                : allSigned
                ? "FINALIZE & EXTRACT TX"
                : `WAITING (${signedCount}/${players.length})`}
            </Button>
          </div>
        </motion.div>
      )}

      {/* --- Step: Broadcast --- */}
      {step === "broadcast" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neon/10 border border-neon/30 rounded-lg p-4 text-center"
        >
          <div className="font-mono text-neon text-lg mb-2">PSBT FINALIZED</div>
          <p className="font-mono text-xs text-muted-foreground">
            Raw transaction extracted. Use the broadcast button in the control
            panel to send it to the Bitcoin network.
          </p>
        </motion.div>
      )}

      {error && (
        <div className="bg-glitch/10 border border-glitch/30 rounded-lg p-3">
          <p className="font-mono text-xs text-glitch">{error}</p>
        </div>
      )}
    </div>
  );
}
