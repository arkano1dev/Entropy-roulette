"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { WalletSelector, type WalletSignResult } from "@/components/wallet/wallet-selector";
import { EducationalSlides } from "@/components/game/educational-slides";
import { UtxoPicker } from "@/components/game/utxo-picker";
import { usePlayerGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import { getFeeEstimates } from "@/lib/bitcoin/mempool-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UTXO } from "@/lib/game/types";

type PlayerMode = "setup" | "wallet" | "utxo" | "wait" | "result";

function PlayerPageInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("game") || "";
  const presenterPubkey = searchParams.get("presenter") || "";

  const {
    phase,
    result,
    publishedPsbt,
    error,
    joinGame,
    submitSignature,
  } = usePlayerGame(gameId, presenterPubkey);

  const { longPulse, victoryPulse, defeatPulse } = useHaptic();

  const [mode, setMode] = useState<PlayerMode>("setup");
  const [betAmount, setBetAmount] = useState(25000);
  const [feeRate, setFeeRate] = useState(10);
  const [joinedAddress, setJoinedAddress] = useState("");
  const [selectedUtxo, setSelectedUtxo] = useState<UTXO | null>(null);
  const [walletSignResult, setWalletSignResult] = useState<WalletSignResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signedPsbt, setSignedPsbt] = useState<string | null>(null);

  // Fetch fee rate on mount
  useEffect(() => {
    getFeeEstimates().then((fees) => setFeeRate(fees.halfHourFee));
  }, []);

  // Monitor phase changes for result
  useEffect(() => {
    if ((phase === "COMPLETE" || result) && mode === "wait") {
      setMode("result");
      if (result?.isWinner) {
        victoryPulse();
      } else {
        defeatPulse();
      }
    }
  }, [phase, result, mode, victoryPulse, defeatPulse]);

  // Step 1 → Step 2: validated bet, move to wallet selection
  const handleContinueFromSetup = () => {
    if (betAmount < 5000) {
      alert("Minimum bet is 5,000 sats");
      return;
    }
    setMode("wallet");
    longPulse();
  };

  // Wallet selector: extension wallet signed successfully
  const handleSignComplete = async (result: WalletSignResult) => {
    setWalletSignResult(result);
    setJoinedAddress(result.address);

    if (result.signedPsbt) {
      setSignedPsbt(result.signedPsbt);
      setSubmitError(null);
      setIsSubmitting(true);
      try {
        await joinGame(betAmount, result.address, undefined);
        await submitSignature(result.signedPsbt);
        setMode("wait");
        longPulse();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to join game");
      } finally {
        setIsSubmitting(false);
      }
    } else if (result.needsUpload) {
      // File-based flow — wallet registered, user signs offline
      await joinGame(betAmount, result.address, undefined);
      setMode("wait");
      longPulse();
    }
  };

  // Wallet selector: manual / address-only
  const handleManualJoin = async (address: string) => {
    setJoinedAddress(address);
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await joinGame(betAmount, address, undefined);
      setMode("wait");
      longPulse();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to join game");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Wallet has been connected in step 2 — move to UTXO selection
  const handleWalletConnected = (address: string) => {
    setJoinedAddress(address);
    setMode("utxo");
  };

  // If game details are missing
  if (!gameId || !presenterPubkey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-2xl text-glitch mb-4">INVALID GAME URL</div>
          <p className="font-mono text-sm text-muted-foreground">
            Missing game ID or presenter key. Scan the QR code again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <h1 className="font-mono text-xl text-neon">ENTROPY ROULETTE</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground">
            GAME: {gameId.toUpperCase()}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {phase}
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MODE: setup                                                         */}
      {/* ------------------------------------------------------------------ */}
      {mode === "setup" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto w-full space-y-6"
        >
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            <h2 className="font-mono text-xl text-neon text-center">
              SET YOUR BET
            </h2>

            <div className="space-y-2">
              <label className="font-mono text-xs text-muted-foreground uppercase">
                Bet amount (sats)
              </label>
              <Input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(Number(e.target.value))}
                min={5000}
                max={1000000}
                className="font-mono text-neon text-lg"
              />
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-neon">{formatSats(betAmount)}</span>
                <span className="text-muted-foreground">
                  — {(betAmount / 100_000_000).toFixed(8)} BTC
                </span>
              </div>
            </div>

            <div className="p-3 bg-muted/20 rounded-lg flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">Network fee rate</span>
              <span className="font-mono text-xs text-neon">{feeRate} sat/vB</span>
            </div>

            <Button
              onClick={handleContinueFromSetup}
              className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
              size="lg"
            >
              CONTINUE
            </Button>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <EducationalSlides variant="player" showControls={true} />
          </div>
        </motion.div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODE: wallet — choose + connect wallet                              */}
      {/* ------------------------------------------------------------------ */}
      {mode === "wallet" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto w-full space-y-4"
        >
          <div className="bg-card border border-border rounded-lg p-6 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-lg text-neon">SELECT WALLET</h2>
              <button
                onClick={() => setMode("setup")}
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Connect your Bitcoin wallet to sign the PSBT. Xverse, Unisat,
              Leather and Alby are supported directly in the browser. Sparrow
              and BlueWallet can sign via a downloaded PSBT file.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <WalletSelector
              mode={publishedPsbt ? "sign-psbt" : "sign-message"}
              psbtBase64={publishedPsbt ?? null}
              inputIndex={0}
              betAmount={betAmount}
              onSignComplete={handleSignComplete}
              onManualSign={handleManualJoin}
            />
          </div>

          {submitError && (
            <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
              <p className="font-mono text-xs text-glitch">{submitError}</p>
            </div>
          )}

          {isSubmitting && (
            <div className="text-center">
              <motion.div
                className="w-5 h-5 border-2 border-neon border-t-transparent rounded-full mx-auto"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <p className="font-mono text-xs text-muted-foreground mt-2">
                Joining game...
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODE: wait                                                           */}
      {/* ------------------------------------------------------------------ */}
      {mode === "wait" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto w-full text-center space-y-6"
        >
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            <motion.div
              className="w-12 h-12 border-2 border-neon border-t-transparent rounded-full mx-auto"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />

            <div className="space-y-2">
              <div className="font-mono text-lg text-neon">
                YOU ARE IN
              </div>
              <div className="font-mono text-sm text-muted-foreground">
                Waiting for the presenter to build and broadcast the transaction.
              </div>
            </div>

            <div className="space-y-1 text-left">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Bet</span>
                <span className="text-neon">{formatSats(betAmount)}</span>
              </div>
              {joinedAddress && (
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Address</span>
                  <span className="text-foreground">
                    {joinedAddress.slice(0, 14)}...{joinedAddress.slice(-6)}
                  </span>
                </div>
              )}
              {walletSignResult && (
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Wallet</span>
                  <span className="text-neon uppercase">{walletSignResult.walletId}</span>
                </div>
              )}
              {signedPsbt && (
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">PSBT signed</span>
                  <span className="text-neon">YES</span>
                </div>
              )}
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Phase</span>
                <span className="text-foreground">{phase}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODE: result                                                         */}
      {/* ------------------------------------------------------------------ */}
      {mode === "result" && result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto w-full"
        >
          {result.isWinner ? (
            <div className="bg-card border border-memphis/50 rounded-lg p-8 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-memphis/20 flex items-center justify-center mx-auto">
                <span className="font-mono text-4xl text-memphis">W</span>
              </div>
              <div className="font-mono text-2xl text-memphis">YOU WON</div>
              <div className="font-mono text-lg text-neon">
                {formatSats(result.totalPot)}
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {result.calculation}
              </p>
              {result.txid && (
                <p className="font-mono text-xs text-muted-foreground break-all">
                  TXID: {result.txid}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center mx-auto">
                <span className="font-mono text-4xl text-muted-foreground">L</span>
              </div>
              <div className="font-mono text-2xl text-muted-foreground">
                NOT THIS TIME
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {result.calculation}
              </p>
              {result.txid && (
                <p className="font-mono text-xs text-muted-foreground break-all">
                  TXID: {result.txid}
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Global error toast */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-glitch/10 border border-glitch/30 rounded-lg p-4">
          <div className="font-mono text-xs text-glitch">{error}</div>
        </div>
      )}
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PlayerPageInner />
    </Suspense>
  );
}
