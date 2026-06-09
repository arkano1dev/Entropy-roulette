"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { WalletSelector } from "@/components/wallet/wallet-selector";
import { EducationalSlides } from "@/components/game/educational-slides";
import { UtxoPicker } from "@/components/game/utxo-picker";
import { usePlayerGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import { getFeeEstimates } from "@/lib/bitcoin/mempool-api";
import { connectXverseWallet, signPlayerPsbt, isSatsConnectAvailable } from "@/lib/bitcoin/sats-connect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UTXO } from "@/lib/game/types";

type PlayerMode = "setup" | "join" | "wait" | "result";

function PlayerPageInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("game") || "";
  const presenterPubkey = searchParams.get("presenter") || "";

  const {
    phase,
    isJoined,
    result,
    publishedPsbt,
    error,
    joinGame,
    submitSignature,
  } = usePlayerGame(gameId, presenterPubkey);

  const { longPulse, victoryPulse, defeatPulse } = useHaptic();

  const [mode, setMode] = useState<PlayerMode>("setup");
  const [betAmount, setBetAmount] = useState(25000);
  const [joinedAddress, setJoinedAddress] = useState("");
  const [hasManualEntry, setHasManualEntry] = useState(false);
  const [signedPsbt, setSignedPsbt] = useState<string | null>(null);
  const [feeRate, setFeeRate] = useState(10);
  // Wallet + UTXO state for the new PSBT signing flow
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [selectedUtxo, setSelectedUtxo] = useState<UTXO | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isSigningPsbt, setIsSigningPsbt] = useState(false);
  const [txStatus, setTxStatus] = useState<
    | "building"
    | "signing"
    | "submitted"
    | "pending"
    | "confirmed"
    | null
  >(null);

  // Fetch fee rate on mount
  useEffect(() => {
    getFeeEstimates().then((fees) => setFeeRate(fees.halfHourFee));
  }, []);

  // Connect Xverse wallet and get address
  const handleConnectWallet = async () => {
    setWalletError(null);
    setIsConnectingWallet(true);
    try {
      const info = await connectXverseWallet();
      setWalletAddress(info.address);
      setJoinedAddress(info.address);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Wallet connection failed");
    } finally {
      setIsConnectingWallet(false);
    }
  };

  // Sign the presenter's published PSBT with the player's selected UTXO input
  const handleSignPublishedPsbt = async () => {
    if (!publishedPsbt || !walletAddress || !selectedUtxo) return;
    setWalletError(null);
    setIsSigningPsbt(true);
    try {
      // Build an updated PSBT with player's UTXO added
      const addRes = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-player",
          psbtBase64: publishedPsbt,
          utxo: selectedUtxo,
          receivingAddress: walletAddress,
          contributionSats: betAmount,
        }),
      });
      const addData = await addRes.json();
      if (!addData.success) throw new Error(addData.error);

      // Find the input index for this player's UTXO (last input added)
      const inputIndex = addData.data.inputCount - 1;

      // Sign with Xverse
      const signed = await signPlayerPsbt(addData.data.psbtBase64, walletAddress, inputIndex);
      await handleSignComplete(signed, walletAddress);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setIsSigningPsbt(false);
    }
  };

  // Transition to join mode
  const handleJoin = () => {
    if (betAmount < 5000) {
      alert("Minimum bet is 5,000 sats");
      return;
    }
    setMode("join");
    longPulse();
  };

  // Handle wallet sign complete
  const handleSignComplete = async (signed: string, address: string) => {
    setSignedPsbt(signed);
    setJoinedAddress(address);
    setTxStatus("submitted");

    try {
      await joinGame(betAmount, address, undefined);
      await submitSignature(signed);
      setTxStatus("pending");
      setMode("wait");
      longPulse();
    } catch (err) {
      console.error("Join/sign failed:", err);
    }
  };

  // Handle manual join (no wallet)
  const handleManualJoin = async (address: string) => {
    setJoinedAddress(address);
    setHasManualEntry(true);
    try {
      await joinGame(betAmount, address, undefined);
      setMode("wait");
      longPulse();
    } catch (err) {
      console.error("Manual join failed:", err);
    }
  };

  // Monitor phase changes
  useEffect(() => {
    if (phase === "COMPLETE" || result) {
      setMode("result");
      if (result?.isWinner) {
        victoryPulse();
      } else {
        defeatPulse();
      }
    } else if (phase === "BROADCAST" || phase === "CONFIRMED") {
      setTxStatus("confirmed");
    }
  }, [phase, result]);

  // If game details are missing
  if (!gameId || !presenterPubkey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-2xl text-glitch mb-4">INVALID GAME URL</div>
          <p className="font-mono text-sm text-muted-foreground">
            Missing game ID or presenter key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-xl text-neon">ENTROPY ROULETTE</h1>
          <span className="font-mono text-sm text-muted-foreground">
            GAME: {gameId.toUpperCase()}
          </span>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          PHASE: {phase}
        </div>
      </header>

      {mode === "setup" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto w-full space-y-6"
        >
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            <h2 className="font-mono text-xl text-neon text-center">
              PLAYER SETUP
            </h2>

            <div className="space-y-2">
              <label className="font-mono text-xs text-muted-foreground uppercase">
                BET AMOUNT (sats)
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
                <span className="text-muted-foreground">≈</span>
                <span className="text-neon">{formatSats(betAmount)}</span>
                <span className="text-muted-foreground">≈ {(betAmount / 100_000_000).toFixed(8)} BTC</span>
              </div>
            </div>

            <div className="p-4 bg-neon/10 border border-neon/30 rounded-lg">
              <div className="font-mono text-xs text-neon mb-2">
                FEE RATE
              </div>
              <div className="font-mono text-sm">{feeRate} sat/vB</div>
            </div>

            <Button
              onClick={handleJoin}
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

      {mode === "join" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto w-full space-y-4"
        >
          {/* Step 1: Connect Wallet */}
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="font-mono text-sm text-neon uppercase">
              Step 1 — Connect Wallet
            </div>
            {walletAddress ? (
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">Connected</span>
                <span className="font-mono text-xs text-neon">
                  {walletAddress.slice(0, 12)}...{walletAddress.slice(-6)}
                </span>
              </div>
            ) : (
              <>
                {isSatsConnectAvailable() ? (
                  <Button
                    onClick={handleConnectWallet}
                    disabled={isConnectingWallet}
                    className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
                  >
                    {isConnectingWallet ? "CONNECTING..." : "CONNECT XVERSE"}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="font-mono text-xs text-muted-foreground">
                      Xverse wallet not detected. Enter your address manually:
                    </p>
                    <Input
                      placeholder="bc1q... or 1... or 3..."
                      className="font-mono text-xs"
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (val.length > 20) {
                          setWalletAddress(val);
                          setJoinedAddress(val);
                        }
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Step 2: Pick UTXO (only after wallet connected) */}
          {walletAddress && (
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="font-mono text-sm text-neon uppercase mb-4">
                Step 2 — Select UTXO
              </div>
              <UtxoPicker
                address={walletAddress}
                minSats={betAmount}
                onSelect={setSelectedUtxo}
                selectedTxid={
                  selectedUtxo ? `${selectedUtxo.txid}:${selectedUtxo.vout}` : undefined
                }
              />
            </div>
          )}

          {/* Step 3: Sign the PSBT (only if UTXO selected + PSBT published) */}
          {walletAddress && selectedUtxo && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="font-mono text-sm text-neon uppercase">
                Step 3 — Sign PSBT
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="text-muted-foreground">Bet amount</div>
                <div className="text-neon text-right">{betAmount.toLocaleString()} sats</div>
                <div className="text-muted-foreground">Selected UTXO</div>
                <div className="text-foreground text-right">{selectedUtxo.value.toLocaleString()} sats</div>
                <div className="text-muted-foreground">PSBT ready</div>
                <div className={`text-right ${publishedPsbt ? "text-neon" : "text-muted-foreground"}`}>
                  {publishedPsbt ? "YES" : "WAITING..."}
                </div>
              </div>

              {walletError && (
                <div className="bg-glitch/10 border border-glitch/30 rounded p-2">
                  <p className="font-mono text-xs text-glitch">{walletError}</p>
                </div>
              )}

              {publishedPsbt ? (
                <Button
                  onClick={handleSignPublishedPsbt}
                  disabled={isSigningPsbt}
                  className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
                >
                  {isSigningPsbt ? "SIGNING..." : "SIGN WITH XVERSE"}
                </Button>
              ) : (
                <div className="text-center py-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    Waiting for presenter to publish PSBT...
                  </p>
                </div>
              )}

              <button
                onClick={() => handleManualJoin(walletAddress)}
                className="w-full font-mono text-xs text-muted-foreground hover:text-foreground underline"
              >
                Join without signing (manual / watch-only)
              </button>
            </div>
          )}

          {/* Fallback: original wallet selector for no-UTXO flow */}
          {!walletAddress && !isSatsConnectAvailable() && publishedPsbt && (
            <WalletSelector
              psbtBase64={publishedPsbt}
              betAmount={betAmount}
              onSignComplete={handleSignComplete}
              onManualSign={handleManualJoin}
            />
          )}
        </motion.div>
      )}

      {mode === "wait" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto w-full text-center space-y-6"
        >
          <div className="bg-card border border-border rounded-lg p-8">
            <motion.div
              className="w-12 h-12 border-2 border-neon border-t-transparent rounded-full mx-auto"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />

            <div className="mt-6 space-y-2">
              <div className="font-mono text-lg text-neon">
                WAITING FOR RESULTS
              </div>
              <div className="font-mono text-sm text-muted-foreground">
                PHASE: {phase}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                Bet: {formatSats(betAmount)}
              </div>
              {joinedAddress && (
                <div className="font-mono text-xs text-muted-foreground">
                  Address: {joinedAddress.slice(0, 20)}...
                </div>
              )}
              {signedPsbt && (
                <div className="font-mono text-xs text-neon">
                  PSBT SIGNED ✓
                </div>
              )}
              {hasManualEntry && (
                <div className="font-mono text-xs text-memphis">
                  Manual entry — check back for result
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {mode === "result" && result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto w-full"
        >
          {result.isWinner ? (
            <div className="bg-card border border-memphis/50 rounded-lg p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="w-20 h-20 rounded-full bg-memphis/20 flex items-center justify-center mx-auto mb-4"
              >
                <span className="text-4xl">🎉</span>
              </motion.div>

              <div className="font-mono text-2xl text-memphis mb-2">
                YOU WON!
              </div>
              <div className="font-mono text-lg text-neon mb-4">
                {formatSats(result.totalPot)}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {result.calculation}
              </div>
              {result.txid && (
                <div className="font-mono text-xs text-muted-foreground mt-2 break-all">
                  TXID: {result.txid}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🎲</span>
              </div>

              <div className="font-mono text-2xl text-muted-foreground mb-2">
                BETTER LUCK NEXT TIME
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {result.calculation}
              </div>
              {result.txid && (
                <div className="font-mono text-xs text-muted-foreground mt-2 break-all">
                  TXID: {result.txid}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

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
