"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { QRCodeSVG } from "qrcode.react";
import { WaitingRoom } from "@/components/player/waiting-room";
import { ResultWinner } from "@/components/player/result-winner";
import { ResultLoser } from "@/components/player/result-loser";
import { usePlayerGame, useHaptic } from "@/hooks/use-game";
import {
  formatSats,
  hasWalletExtension,
  detectWalletType,
  getWalletDisplayName,
  signPsbtWithExtension,
  generateBip21PaymentUri,
} from "@/lib/bitcoin/wallet-connect";
import { generateAnonymousName } from "@/lib/game/state";
import { DEFAULT_CONFIG } from "@/lib/game/types";

type PlayerStep = "landing" | "identity" | "bet" | "wallet" | "waiting" | "result";

function PlayerContent() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("game") || "";
  const presenterPubkey = searchParams.get("presenter") || "";

  const { phase, isJoined, result, error, joinGame, submitSignature, keypair } =
    usePlayerGame(gameId, presenterPubkey);

  const { shortPulse, doublePulse, longPulse, victoryPulse, defeatPulse } = useHaptic();

  const [step, setStep] = useState<PlayerStep>("landing");
  const [displayName, setDisplayName] = useState("");
  const [betAmount, setBetAmount] = useState(DEFAULT_CONFIG.defaultBet);
  const [hasExtension, setHasExtension] = useState(false);
  const [walletType, setWalletType] = useState<string>("none");
  const [signMethod, setSignMethod] = useState<"qr" | "extension" | null>(null);

  // Check for wallet extension on mount
  useEffect(() => {
    setHasExtension(hasWalletExtension());
    setWalletType(getWalletDisplayName(detectWalletType()));
  }, []);

  // Generate default name
  useEffect(() => {
    setDisplayName(generateAnonymousName());
  }, []);

  // Haptic feedback on phase changes
  useEffect(() => {
    if (phase === "COLLECTING_SIGNATURES") {
      longPulse();
    } else if (phase === "BROADCAST") {
      doublePulse();
    } else if (phase === "CONFIRMED" || phase === "COMPLETE") {
      if (result?.isWinner) {
        victoryPulse();
      } else {
        defeatPulse();
      }
      setStep("result");
    }
  }, [phase, result, longPulse, doublePulse, victoryPulse, defeatPulse]);

  // Handle step transitions
  const handleEnter = () => {
    shortPulse();
    setStep("identity");
  };

  const handleIdentityConfirm = () => {
    shortPulse();
    setStep("bet");
  };

  const handleBetConfirm = () => {
    shortPulse();
    setStep("wallet");
  };

  const handleWalletSign = async () => {
    try {
      longPulse();

      // Join the game
      await joinGame(betAmount, displayName);

      // If using extension, attempt to sign
      if (signMethod === "extension" && hasExtension) {
        // In real implementation, we would get the PSBT from the game
        // For now, we simulate the signing
        // const signedPsbt = await signPsbtWithExtension(basePsbt);
        // await submitSignature(signedPsbt);
      }

      setStep("waiting");
    } catch (err) {
      console.error("Failed to join:", err);
    }
  };

  // No game ID - show error
  if (!gameId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <div className="font-mono text-glitch text-xl mb-4">ERROR</div>
          <p className="font-mono text-muted-foreground">
            No game ID provided. Please scan a valid QR code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {/* Landing */}
      {step === "landing" && (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -20 }}
          className="min-h-screen bg-background flex flex-col items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <h1 className="font-mono text-3xl text-neon mb-2">
              ENTROPY ROULETTE
            </h1>
            <p className="font-mono text-sm text-muted-foreground mb-8">
              PSBT Collaborative Transaction Game
            </p>

            <div className="mb-8">
              <div className="font-mono text-xs text-muted-foreground mb-2">
                GAME ID
              </div>
              <div className="font-mono text-xl text-neon tracking-widest">
                {gameId.toUpperCase()}
              </div>
            </div>

            <motion.div
              className="font-mono text-xs text-muted-foreground mb-4"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Your sats. Your risk. Bitcoin&apos;s entropy.
            </motion.div>

            <Button
              onClick={handleEnter}
              className="bg-neon text-background hover:bg-neon/80 font-mono px-8 py-6 text-lg"
            >
              ENTER THE ROULETTE
            </Button>
          </motion.div>

          {/* Terminal typing effect */}
          <motion.div
            className="absolute bottom-8 left-0 right-0 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <div className="font-mono text-xs text-muted-foreground text-center">
              <span className="text-neon">{">"}</span> connecting to entropy
              field...
              <motion.span
                className="inline-block w-2 h-3 bg-neon ml-1"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Identity */}
      {step === "identity" && (
        <motion.div
          key="identity"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="min-h-screen bg-background flex flex-col items-center justify-center p-6"
        >
          <div className="w-full max-w-sm">
            <h2 className="font-mono text-xl text-neon mb-2 text-center">
              IDENTITY
            </h2>
            <p className="font-mono text-xs text-muted-foreground text-center mb-8">
              How should you be known?
            </p>

            <div className="space-y-6">
              <div>
                <label className="font-mono text-xs text-muted-foreground block mb-2">
                  DISPLAY NAME
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Anonymous"
                  className="font-mono text-center text-lg"
                />
              </div>

              <Button
                onClick={() => setDisplayName(generateAnonymousName())}
                variant="outline"
                className="w-full font-mono text-sm"
              >
                GENERATE RANDOM NAME
              </Button>

              <Button
                onClick={handleIdentityConfirm}
                disabled={!displayName.trim()}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
              >
                CONFIRM IDENTITY
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Bet amount */}
      {step === "bet" && (
        <motion.div
          key="bet"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="min-h-screen bg-background flex flex-col items-center justify-center p-6"
        >
          <div className="w-full max-w-sm">
            <h2 className="font-mono text-xl text-neon mb-2 text-center">
              YOUR BET
            </h2>
            <p className="font-mono text-xs text-muted-foreground text-center mb-8">
              How much entropy are you contributing?
            </p>

            <div className="space-y-8">
              {/* Amount display */}
              <div className="text-center">
                <motion.div
                  key={betAmount}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="font-mono text-4xl text-memphis mb-2"
                >
                  {formatSats(betAmount)}
                </motion.div>
                <div className="font-mono text-xs text-muted-foreground">
                  {(betAmount / 100_000_000).toFixed(8)} BTC
                </div>
              </div>

              {/* Slider */}
              <div className="px-4">
                <Slider
                  value={[betAmount]}
                  onValueChange={(v) => setBetAmount(v[0])}
                  min={DEFAULT_CONFIG.minBet}
                  max={DEFAULT_CONFIG.maxBet}
                  step={1000}
                  className="w-full"
                />
                <div className="flex justify-between mt-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatSats(DEFAULT_CONFIG.minBet)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatSats(DEFAULT_CONFIG.maxBet)}
                  </span>
                </div>
              </div>

              {/* Quick amounts */}
              <div className="grid grid-cols-3 gap-2">
                {[10000, 25000, 50000].map((amount) => (
                  <Button
                    key={amount}
                    variant={betAmount === amount ? "default" : "outline"}
                    onClick={() => setBetAmount(amount)}
                    className="font-mono text-xs"
                  >
                    {formatSats(amount)}
                  </Button>
                ))}
              </div>

              <Button
                onClick={handleBetConfirm}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
              >
                LOCK IN BET
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Wallet */}
      {step === "wallet" && (
        <motion.div
          key="wallet"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="min-h-screen bg-background flex flex-col items-center justify-center p-6"
        >
          <div className="w-full max-w-sm">
            <h2 className="font-mono text-xl text-neon mb-2 text-center">
              SIGN YOUR INPUT
            </h2>
            <p className="font-mono text-xs text-muted-foreground text-center mb-8">
              Choose how to sign your PSBT input
            </p>

            <div className="space-y-4">
              {/* Extension option */}
              {hasExtension && (
                <motion.button
                  onClick={() => setSignMethod("extension")}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    signMethod === "extension"
                      ? "border-neon bg-neon/10"
                      : "border-border hover:border-neon/50"
                  }`}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="font-mono text-sm text-neon mb-1">
                    BROWSER EXTENSION
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    Sign with {walletType}
                  </div>
                </motion.button>
              )}

              {/* QR option */}
              <motion.button
                onClick={() => setSignMethod("qr")}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  signMethod === "qr"
                    ? "border-neon bg-neon/10"
                    : "border-border hover:border-neon/50"
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <div className="font-mono text-sm text-neon mb-1">
                  MOBILE WALLET
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  Scan QR with BlueWallet, Sparrow, etc.
                </div>
              </motion.button>

              {/* QR Code display */}
              {signMethod === "qr" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-white rounded-lg mx-auto w-fit">
                    <QRCodeSVG
                      value={generateBip21PaymentUri(
                        "bc1qentropy", // Placeholder
                        betAmount,
                        "Entropy Roulette"
                      )}
                      size={200}
                      level="M"
                    />
                  </div>
                  <p className="font-mono text-xs text-center text-muted-foreground mt-4">
                    Scan to sign your input
                  </p>
                </motion.div>
              )}

              <Button
                onClick={handleWalletSign}
                disabled={!signMethod}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono mt-4"
              >
                {signMethod === "extension"
                  ? "SIGN WITH EXTENSION"
                  : signMethod === "qr"
                    ? "I HAVE SIGNED"
                    : "SELECT SIGNING METHOD"}
              </Button>
            </div>

            {/* Bet summary */}
            <div className="mt-8 p-4 bg-muted/20 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="font-mono text-xs text-muted-foreground">
                  Identity
                </span>
                <span className="font-mono text-xs text-neon">{displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs text-muted-foreground">
                  Bet
                </span>
                <span className="font-mono text-xs text-memphis">
                  {formatSats(betAmount)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Waiting */}
      {step === "waiting" && (
        <motion.div
          key="waiting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <WaitingRoom
            phase={phase}
            playerCount={5} // Would come from game state
            totalPot={125000} // Would come from game state
            playerPosition={3} // Would come from game state
            displayName={displayName}
          />
        </motion.div>
      )}

      {/* Result */}
      {step === "result" && result && (
        <motion.div
          key="result"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {result.isWinner ? (
            <ResultWinner
              displayName={displayName}
              totalPot={result.totalPot}
              txid={result.txid}
              calculation={result.calculation}
            />
          ) : (
            <ResultLoser
              displayName={displayName}
              totalPot={result.totalPot}
              txid={result.txid}
              calculation={result.calculation}
              winnerName="SatoshiHodler42"
              inputIndex={3}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="font-mono text-neon animate-pulse">Loading...</div>
        </div>
      }
    >
      <PlayerContent />
    </Suspense>
  );
}
