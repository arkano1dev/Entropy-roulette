"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { WalletSelector } from "@/components/wallet/wallet-selector";
import { EducationalSlides } from "@/components/game/educational-slides";
import { WaitingRoom } from "@/components/player/waiting-room";
import { ResultWinner } from "@/components/player/result-winner";
import { ResultLoser } from "@/components/player/result-loser";
import { usePlayerGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import { generateAnonymousName } from "@/lib/game/state";
import { DEFAULT_CONFIG } from "@/lib/game/types";

type PlayerStep =
  | "landing"
  | "learn"
  | "identity"
  | "bet"
  | "wallet"
  | "waiting"
  | "result";

function PlayerContent() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("game") || "";
  const presenterPubkey = searchParams.get("presenter") || "";

  const { phase, isJoined, result, error, joinGame, submitSignature, keypair } =
    usePlayerGame(gameId, presenterPubkey);

  const { shortPulse, doublePulse, longPulse, victoryPulse, defeatPulse } =
    useHaptic();

  const [step, setStep] = useState<PlayerStep>("landing");
  const [displayName, setDisplayName] = useState("");
  const [betAmount, setBetAmount] = useState(DEFAULT_CONFIG.defaultBet);
  const [wantsToLearn, setWantsToLearn] = useState<boolean | null>(null);

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
  const handleEnter = (learn: boolean) => {
    shortPulse();
    setWantsToLearn(learn);
    if (learn) {
      setStep("learn");
    } else {
      setStep("identity");
    }
  };

  const handleLearnComplete = () => {
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

  const handleWalletSign = async (receivingAddress: string) => {
    try {
      longPulse();
      await joinGame(betAmount, receivingAddress, displayName);
      setStep("waiting");
    } catch (err) {
      console.error("Failed to join:", err);
    }
  };

  const handleSignComplete = async (signedPsbt: string, receivingAddress: string) => {
    try {
      // First join with receiving address, then submit signature
      await joinGame(betAmount, receivingAddress, displayName);
      await submitSignature(signedPsbt);
      setStep("waiting");
    } catch (err) {
      console.error("Failed to submit signature:", err);
    }
  };

  // No game ID - show error
  if (!gameId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="font-mono text-glitch text-xl mb-4">
            NO GAME FOUND
          </div>
          <p className="font-mono text-sm text-muted-foreground mb-6">
            Please scan a valid QR code from the presenter screen to join a
            game.
          </p>
          <div className="p-4 bg-muted/20 rounded-lg">
            <div className="font-mono text-xs text-muted-foreground">
              Looking for a game?
            </div>
            <div className="font-mono text-sm text-neon mt-2">
              Ask the presenter to show the join QR code
            </div>
          </div>
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
            className="text-center w-full max-w-sm"
          >
            <h1 className="font-mono text-3xl text-neon mb-2">
              ENTROPY ROULETTE
            </h1>
            <p className="font-mono text-sm text-muted-foreground mb-8">
              PSBT Collaborative Transaction Game
            </p>

            <div className="mb-8 p-4 bg-card border border-border rounded-lg">
              <div className="font-mono text-xs text-muted-foreground mb-2">
                GAME ID
              </div>
              <div className="font-mono text-xl text-neon tracking-widest">
                {gameId.toUpperCase()}
              </div>
            </div>

            <motion.div
              className="font-mono text-xs text-muted-foreground mb-8"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Your sats. Your risk. Bitcoin&apos;s entropy.
            </motion.div>

            <div className="space-y-3">
              <Button
                onClick={() => handleEnter(false)}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6 text-lg"
              >
                JOIN GAME
              </Button>
              <Button
                onClick={() => handleEnter(true)}
                variant="outline"
                className="w-full font-mono py-6"
              >
                LEARN HOW IT WORKS FIRST
              </Button>
            </div>
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

      {/* Learn */}
      {step === "learn" && (
        <motion.div
          key="learn"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="min-h-screen bg-background flex flex-col items-center justify-center p-6"
        >
          <EducationalSlides variant="player" onComplete={handleLearnComplete} />
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
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-sm">
                  1
                </div>
                <h2 className="font-mono text-xl text-neon">IDENTITY</h2>
              </div>
              <p className="font-mono text-xs text-muted-foreground ml-10">
                How should you be known in this game?
              </p>
            </div>

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
                <p className="font-mono text-xs text-muted-foreground mt-2 text-center">
                  This is how other players will see you
                </p>
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
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
              >
                CONTINUE
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
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-sm">
                  2
                </div>
                <h2 className="font-mono text-xl text-neon">YOUR BET</h2>
              </div>
              <p className="font-mono text-xs text-muted-foreground ml-10">
                How much are you willing to risk?
              </p>
            </div>

            <div className="space-y-8">
              {/* Amount display */}
              <div className="text-center p-6 bg-card border border-border rounded-lg">
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
                    className={`font-mono text-xs ${
                      betAmount === amount
                        ? "bg-neon text-background"
                        : ""
                    }`}
                  >
                    {formatSats(amount)}
                  </Button>
                ))}
              </div>

              {/* Warning */}
              <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
                <p className="font-mono text-xs text-glitch">
                  Only bet what you can afford to lose. Winner takes all.
                </p>
              </div>

              <Button
                onClick={handleBetConfirm}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
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
          className="min-h-screen bg-background flex flex-col py-8 px-6 overflow-auto"
        >
          <div className="w-full max-w-sm mx-auto">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-sm">
                  3
                </div>
                <h2 className="font-mono text-xl text-neon">SIGN WITH WALLET</h2>
              </div>
              <p className="font-mono text-xs text-muted-foreground ml-10">
                Choose your Bitcoin wallet to sign the transaction
              </p>
            </div>

            {/* Bet summary */}
            <div className="mb-6 p-4 bg-muted/20 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="font-mono text-xs text-muted-foreground">
                  Playing as
                </span>
                <span className="font-mono text-xs text-neon">{displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs text-muted-foreground">
                  Betting
                </span>
                <span className="font-mono text-xs text-memphis">
                  {formatSats(betAmount)}
                </span>
              </div>
            </div>

            {/* Wallet Selector */}
            <WalletSelector
              psbtBase64="" // This would come from the game state
              betAmount={betAmount}
              onSignComplete={handleSignComplete}
              onManualSign={handleWalletSign}
            />

            {/* Educational note */}
            <div className="mt-6 p-4 bg-card border border-border rounded-lg">
              <h4 className="font-mono text-xs text-neon mb-2">
                What happens when you sign?
              </h4>
              <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                Your wallet will create a signature for your input. This proves
                you authorize spending your sats. The signature is combined with
                other players&apos; signatures to create the final transaction.
              </p>
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
            playerCount={5}
            totalPot={125000}
            playerPosition={3}
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
