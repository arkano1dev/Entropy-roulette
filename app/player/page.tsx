"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { WalletSelector, type WalletSignResult } from "@/components/wallet/wallet-selector";
import { usePlayerGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import {
  getFeeEstimates,
  getAddressUTXOs,
  getOutputScriptPubKey,
  type MempoolUTXO,
} from "@/lib/bitcoin/mempool-api";
import { decodePsbt } from "@/lib/bitcoin/psbt-engine";
import { buildParticipantPsbt, perParticipantFee } from "@/lib/bitcoin/psbt-combine";
import { Button } from "@/components/ui/button";
import type { WalletId } from "@/components/wallet/wallet-selector";
import { ChevronDown, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Player flow steps
// ---------------------------------------------------------------------------
// scroll       → read the long-form content page, single CTA at bottom
// sign-message → pick wallet, sign ownership message, registers in lobby
// bet          → pick which coin (UTXO) to stake — whole coin goes into the pot
// wait         → idle; when publishedPsbt arrives, inline sign-psbt appears
// result       → win / lose
// ---------------------------------------------------------------------------

type PlayerStep = "scroll" | "sign-message" | "bet" | "wait" | "result";

// ---------------------------------------------------------------------------
// Content sections rendered on the scroll page
// ---------------------------------------------------------------------------

function ScrollSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-[85vh] flex flex-col justify-center py-16 px-4 border-b border-border/40">
      <div className="max-w-md mx-auto w-full space-y-4">
        <div>
          <h2 className="font-mono text-2xl text-neon text-balance leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="font-mono text-sm text-muted-foreground mt-1">
              {subtitle}
            </p>
          )}
        </div>
        <div className="font-mono text-sm text-foreground leading-relaxed space-y-3">
          {children}
        </div>
      </div>
    </section>
  );
}

function ScrollPage({ onReady }: { onReady: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center border-b border-border/40">
        <div className="max-w-md w-full space-y-6">
          <h1 className="font-mono text-4xl text-neon text-balance leading-tight">
            ENTROPY ROULETTE
          </h1>
          <p className="font-mono text-base text-muted-foreground leading-relaxed">
            A live Bitcoin game where you sign a real PSBT on mainnet. One
            transaction. Many signers. One winner chosen by the blockchain.
          </p>

          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <span className="font-mono text-xs">Scroll to learn how it works</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </div>
        </div>
      </div>

      {/* Section 1: What is a Bitcoin transaction */}
      <ScrollSection
        title="A Bitcoin transaction"
        subtitle="What actually happens when you send sats"
      >
        <p>
          Every Bitcoin transaction has <span className="text-neon">inputs</span> —
          coins you already own — and <span className="text-neon">outputs</span> —
          where those coins are going. No signature, no spend.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="text-neon text-xs mb-1 uppercase">Inputs</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              UTXOs — Unspent Transaction Outputs. Each is a specific coin
              identified by a previous transaction ID and output index.
            </div>
          </div>
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="text-neon text-xs mb-1 uppercase">Outputs</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Addresses that receive funds. Any leftover after outputs and
              fees goes back to you as change.
            </div>
          </div>
        </div>
        <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your private key never leaves your device. The signature it
            produces is the only thing that authorises the spend.
          </p>
        </div>
      </ScrollSection>

      {/* Section 2: What is a PSBT */}
      <ScrollSection
        title="What is a PSBT?"
        subtitle="Partially Signed Bitcoin Transaction — BIP 174"
      >
        <p>
          A <span className="text-neon">PSBT</span> is a standard format for a
          Bitcoin transaction that is not yet complete. It carries everything
          each signer needs — without exposing any private keys.
        </p>
        {[
          {
            label: "Built offline",
            desc: "Constructed and inspected entirely without touching the network.",
          },
          {
            label: "Passed between signers",
            desc: "Each wallet adds its own signature. Via QR, file, or clipboard.",
          },
          {
            label: "Finalized and broadcast",
            desc: "Once all signatures are present, it becomes a valid raw transaction.",
          },
        ].map((item) => (
          <div key={item.label} className="flex gap-3 p-3 bg-muted/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-neon mt-1.5 flex-shrink-0" />
            <div>
              <div className="text-xs text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {item.desc}
              </div>
            </div>
          </div>
        ))}
      </ScrollSection>

      {/* Section 3: How the game works */}
      <ScrollSection
        title="How the game works"
        subtitle="One transaction, many players"
      >
        <p>
          The presenter builds a single PSBT where every player contributes
          one input. All inputs flow into a single escrow output — the pot.
        </p>
        <div className="space-y-2">
          {[
            { n: "1", label: "Players sign a message", desc: "Proves wallet ownership. Registers you in the lobby. Nothing is broadcast." },
            { n: "2", label: "Presenter builds the PSBT", desc: "All player UTXOs assembled into one unsigned transaction." },
            { n: "3", label: "Each player signs their input", desc: "Your wallet shows you exactly what you are signing. Review it." },
            { n: "4", label: "Tx 1 is broadcast", desc: "All signatures combined. The raw transaction hits the Bitcoin network." },
            { n: "5", label: "Winner is revealed", desc: "Last byte of the confirmed TXID mod number of players. Public and verifiable." },
            { n: "6", label: "Presenter pays out (Tx 2)", desc: "Presenter sends the pot to the winner's address from their own wallet." },
          ].map((row) => (
            <div key={row.n} className="flex gap-3 p-3 bg-muted/20 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-xs flex-shrink-0">
                {row.n}
              </div>
              <div>
                <div className="text-xs text-foreground">{row.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {row.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollSection>

      {/* Section 4: How the winner is picked */}
      <ScrollSection
        title="How the winner is chosen"
        subtitle="Verifiable randomness from the Bitcoin network"
      >
        <p>
          When Tx 1 is confirmed it receives a <span className="text-neon">TXID</span> —
          a 32-byte hash determined by the mining process. Nobody can predict
          or control it before the block is found.
        </p>
        <div className="p-4 bg-muted/20 rounded-lg">
          <div className="text-xs text-muted-foreground mb-2">Winner formula</div>
          <code className="text-neon text-sm block">
            last_byte(TXID) % player_count
          </code>
          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Example: last byte = <span className="text-memphis">0x42</span> (66),
            5 players → 66 % 5 = <span className="text-memphis">1</span> → Player 2 wins.
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Anyone can verify this on any block explorer using only the TXID.
        </p>
      </ScrollSection>

      {/* Section 5: What you are agreeing to */}
      <ScrollSection
        title="What you are agreeing to"
        subtitle="Read this before you sign"
      >
        <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
          <div className="text-xs text-neon mb-1">Your keys, your coins</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This app never sees your private key. Your wallet signs locally.
            You can read the full transaction before approving.
          </p>
        </div>
        <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
          <div className="text-xs text-glitch mb-1">One input, one bet</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You authorise your wallet to spend the UTXO you select. That
            amount goes to the escrow pot. If you do not win, it goes to the
            winner.
          </p>
        </div>
        <div className="p-3 bg-muted/20 rounded-lg">
          <div className="text-xs text-foreground mb-1">No refunds</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Once broadcast and confirmed, the transaction cannot be reversed.
            Only bet what you are comfortable losing.
          </p>
        </div>

        {/* Creator contact */}
        <div className="space-y-2 pt-2">
          <p className="font-mono text-[10px] text-muted-foreground uppercase">Created by</p>
          <a
            href="https://njump.me/npub1p2x3t3njq44vsk24qjkauzurvfd59c224qyu2mpgu9jverk9tfrqnz0ql5"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-3 bg-neon/10 border border-neon/30 rounded-lg hover:bg-neon/20 active:scale-95 transition-all"
          >
            <span className="font-mono text-xs text-neon uppercase w-20 flex-shrink-0">NOSTR</span>
            <span className="font-mono text-xs text-muted-foreground truncate">npub1p2x3t3njq44v…</span>
          </a>
          <a
            href="https://t.me/arkano21"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-3 bg-neon/10 border border-neon/30 rounded-lg hover:bg-neon/20 active:scale-95 transition-all"
          >
            <span className="font-mono text-xs text-neon uppercase w-20 flex-shrink-0">TELEGRAM</span>
            <span className="font-mono text-xs text-muted-foreground truncate">@arkano21</span>
          </a>
          <a
            href="https://github.com/arkano1dev/v0-entropy-roulette"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-4 py-3 bg-neon/10 border border-neon/30 rounded-lg hover:bg-neon/20 active:scale-95 transition-all"
          >
            <span className="font-mono text-xs text-neon uppercase w-20 flex-shrink-0">GITHUB</span>
            <span className="font-mono text-xs text-muted-foreground truncate">arkano1dev/v0-entropy-roulette</span>
          </a>
        </div>

        {/* CTA */}
        <div className="pt-2 space-y-2">
          <p className="font-mono text-[10px] text-muted-foreground/60 text-center">
            Game under development — experimental, mainnet, use at your own risk.
          </p>
          <Button
            onClick={onReady}
            className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6 text-base"
            size="lg"
          >
            I understand — choose my wallet
          </Button>
        </div>
      </ScrollSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback block — shown on result screen
// ---------------------------------------------------------------------------

function FeedbackBlock() {
  const [feedbackText, setFeedbackText] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!feedbackText.trim()) return;
    // Encode as mailto link so it opens the default mail app
    const subject = encodeURIComponent("Entropy Roulette — Player Feedback");
    const body = encodeURIComponent(feedbackText.trim());
    window.open(`mailto:feedback@entropyroulette.xyz?subject=${subject}&body=${body}`, "_blank");
    setSent(true);
  };

  if (sent) {
    return (
      <div className="bg-card border border-neon/30 rounded-lg p-4 text-center">
        <p className="font-mono text-sm text-neon">Thanks for your feedback!</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="font-mono text-xs text-muted-foreground uppercase">
        Share your feedback
      </div>
      <p className="font-mono text-xs text-muted-foreground leading-relaxed">
        How was the experience? Suggestions, bugs, or anything you want to tell us?
      </p>
      <textarea
        value={feedbackText}
        onChange={(e) => setFeedbackText(e.target.value)}
        placeholder="Your thoughts..."
        rows={3}
        className="w-full px-3 py-2 bg-muted/20 border border-border rounded-lg font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon resize-none"
      />
      <Button
        onClick={handleSend}
        disabled={!feedbackText.trim()}
        className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
        size="sm"
      >
        Send feedback
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main inner component
// ---------------------------------------------------------------------------

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

  const [step, setStep] = useState<PlayerStep>("scroll");
  // The committed amount = the value of the selected coin (whole UTXO goes in).
  const [betAmount, setBetAmount] = useState(0);
  // Coin picker: the player's available UTXOs and the one they choose to stake.
  const [utxos, setUtxos] = useState<MempoolUTXO[] | null>(null);
  const [selectedUtxo, setSelectedUtxo] = useState<MempoolUTXO | null>(null);
  const [isLoadingUtxos, setIsLoadingUtxos] = useState(false);
  const [utxoError, setUtxoError] = useState<string | null>(null);
  const [feeRate, setFeeRate] = useState(10);
  const [joinedAddress, setJoinedAddress] = useState("");
  const [joinedUtxo, setJoinedUtxo] = useState<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  } | null>(null);
  const [chosenWalletId, setChosenWalletId] = useState<WalletId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [psbtSigned, setPsbtSigned] = useState(false);
  // Track whether sign-message is done so we don't re-show in wait step
  const [messageSigned, setMessageSigned] = useState(false);

  const signPsbtShownRef = useRef(false);

  // Fetch fee rate on mount
  useEffect(() => {
    getFeeEstimates().then((fees) => setFeeRate(fees.halfHourFee)).catch(() => {});
  }, []);

  // When PSBT arrives during wait step, re-use the same wallet to sign it
  useEffect(() => {
    if (
      publishedPsbt &&
      step === "wait" &&
      !psbtSigned &&
      !signPsbtShownRef.current
    ) {
      // Don't auto-redirect — the wait screen will show the sign prompt inline
    }
  }, [publishedPsbt, step, psbtSigned]);

  // Phase transitions
  useEffect(() => {
    if ((phase === "COMPLETE" || result) && (step === "wait")) {
      setStep("result");
      if (result?.isWinner) {
        victoryPulse();
      } else {
        defeatPulse();
      }
    }
  }, [phase, result, step, victoryPulse, defeatPulse]);

  // ── Step: scroll → sign-message ──────────────────────────────────────────
  const handleScrollReady = () => {
    setStep("sign-message");
    longPulse();
  };

  // ── Step: sign-message complete → bet ────────────────────────────────────
  // Called by WalletSelector when the sign-message step is done
  // We only record the address here — actual lobby join happens after bet is confirmed
  const handleMessageSigned = async (signResult: WalletSignResult) => {
    setJoinedAddress(signResult.address);
    setChosenWalletId(signResult.walletId);
    setMessageSigned(true);
    setStep("bet");
    longPulse();
  };

  // File/manual wallets: address-only registration
  const handleManualJoin = async (address: string) => {
    setJoinedAddress(address);
    setChosenWalletId("manual");
    setStep("bet");
    longPulse();
  };

  // ── Step: bet — load the player's coins to choose from ────────────────────
  useEffect(() => {
    if (step !== "bet" || !joinedAddress) return;
    setIsLoadingUtxos(true);
    setUtxoError(null);
    setSelectedUtxo(null);
    getAddressUTXOs(joinedAddress)
      .then((list) => {
        // Confirmed first, then largest value first.
        const sorted = [...list].sort((a, b) => {
          const conf = (a.status.confirmed ? 0 : 1) - (b.status.confirmed ? 0 : 1);
          return conf !== 0 ? conf : b.value - a.value;
        });
        setUtxos(sorted);
      })
      .catch((e) => setUtxoError(e instanceof Error ? e.message : "Failed to load coins"))
      .finally(() => setIsLoadingUtxos(false));
  }, [step, joinedAddress]);

  // ── Step: coin selected → enrich with scriptPubKey → register → wait ──────
  const handleCoinConfirmed = async () => {
    if (!selectedUtxo) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // The whole selected UTXO becomes the player's INPUT. Enrich it with the
      // scriptPubKey needed to build the PSBT input.
      const scriptPubKey = await getOutputScriptPubKey(selectedUtxo.txid, selectedUtxo.vout);
      const enriched = {
        txid: selectedUtxo.txid,
        vout: selectedUtxo.vout,
        value: selectedUtxo.value,
        scriptPubKey,
      };
      setJoinedUtxo(enriched);
      setBetAmount(selectedUtxo.value);

      // Register the player, carrying the UTXO so the presenter can splice it in.
      await joinGame(selectedUtxo.value, joinedAddress, undefined, enriched);
      setStep("wait");
      longPulse();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to join game");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step: wait — sign PSBT when it arrives ────────────────────────────────
  const handlePsbtSigned = async (signResult: WalletSignResult) => {
    if (!signResult.signedPsbt) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitSignature(signResult.signedPsbt);
      setPsbtSigned(true);
      longPulse();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit signature");
    } finally {
      setIsSubmitting(false);
    }
  };

  // File wallet: downloaded and signed offline
  const handlePsbtManual = (_address: string) => {
    setPsbtSigned(true);
    longPulse();
  };

  // ── Guard: missing game params ────────────────────────────────────────────
  if (!gameId || !presenterPubkey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="font-mono text-2xl text-glitch mb-4">INVALID GAME URL</div>
          <p className="font-mono text-sm text-muted-foreground leading-relaxed">
            Missing game ID or presenter key. Scan the QR code again.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: scroll ────────────────────────────────────────────────────────
  if (step === "scroll") {
    return <ScrollPage onReady={handleScrollReady} />;
  }

  // ── Shared header for remaining steps ────────────────────────────────────
  const StepHeader = ({
    stepLabel,
    onBack,
  }: {
    stepLabel: string;
    onBack?: () => void;
  }) => (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
        )}
        <span className="font-mono text-xs text-neon">ENTROPY ROULETTE</span>
      </div>
      <span className="font-mono text-xs text-muted-foreground uppercase">
        {stepLabel}
      </span>
    </header>
  );

  // ── Render: sign-message ──────────────────────────────────────────────────
  if (step === "sign-message") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StepHeader stepLabel="Sign in" onBack={() => setStep("scroll")} />
        <div className="flex-1 flex flex-col justify-center px-4 py-8 max-w-md mx-auto w-full space-y-4">
          <div className="space-y-1">
            <h2 className="font-mono text-xl text-neon">Confirm your wallet</h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Sign a short message to prove you own this wallet. Nothing is
              broadcast to Bitcoin — this is an off-chain ownership proof that
              registers you in the lobby.
            </p>
          </div>

          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">
              Message you will sign
            </div>
            <p className="font-mono text-xs text-foreground leading-relaxed italic">
              &ldquo;I am joining Entropy Roulette. I confirm I want to participate
              in this Bitcoin PSBT game and that my wallet address belongs
              to me.&rdquo;
            </p>
          </div>

          <WalletSelector
            mode="sign-message"
            psbtBase64={null}
            betAmount={betAmount}
            onSignComplete={handleMessageSigned}
            onManualSign={handleManualJoin}
          />

          {submitError && (
            <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
              <p className="font-mono text-xs text-glitch">{submitError}</p>
            </div>
          )}

          {isSubmitting && (
            <div className="flex items-center gap-2 justify-center">
              <motion.div
                className="w-4 h-4 border-2 border-neon border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <span className="font-mono text-xs text-muted-foreground">
                Joining game...
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: bet — pick which coin (UTXO) to stake ─────────────────────────
  if (step === "bet") {
    const fee = perParticipantFee(feeRate);
    const isSelected = (u: MempoolUTXO) =>
      selectedUtxo?.txid === u.txid && selectedUtxo?.vout === u.vout;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StepHeader stepLabel="Choose your coin" onBack={() => setStep("sign-message")} />
        <div className="flex-1 flex flex-col justify-center px-4 py-8 max-w-md mx-auto w-full space-y-4">
          <div className="space-y-1">
            <h2 className="font-mono text-xl text-neon">Pick the coin to stake</h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              The <span className="text-foreground">entire coin you select</span> goes into the
              pot, minus the network fee. There is no change output, so choose a coin close to
              the amount you want to bet.
            </p>
          </div>

          <div className="p-3 bg-muted/20 rounded-lg flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">Fee rate</span>
            <span className="font-mono text-xs text-neon">
              {feeRate} sat/vB → fee {formatSats(fee)}
            </span>
          </div>

          {isLoadingUtxos && (
            <div className="flex items-center gap-2 justify-center py-6">
              <motion.div
                className="w-4 h-4 border-2 border-neon border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <span className="font-mono text-xs text-muted-foreground">Loading your coins…</span>
            </div>
          )}

          {utxoError && (
            <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
              <p className="font-mono text-xs text-glitch">{utxoError}</p>
            </div>
          )}

          {utxos && utxos.length === 0 && (
            <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
              <p className="font-mono text-xs text-glitch leading-relaxed">
                No coins found for this wallet. Fund the address first, then go back and retry.
              </p>
            </div>
          )}

          {utxos && utxos.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {utxos.map((u) => {
                const potContribution = u.value - fee;
                const viable = potContribution > 546;
                const sel = isSelected(u);
                return (
                  <button
                    key={`${u.txid}:${u.vout}`}
                    disabled={!viable}
                    onClick={() => {
                      setSelectedUtxo(u);
                      setBetAmount(u.value);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      sel
                        ? "border-neon bg-neon/10"
                        : viable
                        ? "border-border bg-muted/10 hover:border-neon/50"
                        : "border-border bg-muted/5 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-neon">{formatSats(u.value)}</span>
                      <span
                        className={`font-mono text-[10px] ${
                          u.status.confirmed ? "text-muted-foreground" : "text-glitch"
                        }`}
                      >
                        {u.status.confirmed ? "confirmed" : "unconfirmed"}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5 break-all">
                      {u.txid.slice(0, 16)}…:{u.vout}
                      {viable ? (
                        <span className="text-neon"> → {formatSats(potContribution)} to pot</span>
                      ) : (
                        <span className="text-glitch"> — too small for fee</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
              <p className="font-mono text-xs text-glitch">{submitError}</p>
            </div>
          )}

          <Button
            onClick={handleCoinConfirmed}
            disabled={!selectedUtxo || isSubmitting}
            className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
            size="lg"
          >
            {isSubmitting
              ? "Joining game..."
              : selectedUtxo
              ? `Stake ${formatSats(selectedUtxo.value)}`
              : "Select a coin"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: wait (and inline sign-psbt when PSBT arrives) ─────────────────
  if (step === "wait") {
    const hasPsbt = !!publishedPsbt;
    const needsSign = hasPsbt && !psbtSigned;

    // Coinjoin model: the presenter's published fragment only tells us the
    // ESCROW ADDRESS (its single output). We build our OWN 1-in/1-out fragment
    // from our UTXO → escrow, flagged SIGHASH_SINGLE|ANYONECANPAY, and sign
    // input #0 of it. The presenter splices it into the coinjoin.
    let myFragment: string | null = null;
    let buildError: string | null = null;
    if (publishedPsbt && joinedUtxo) {
      try {
        const decoded = decodePsbt(publishedPsbt);
        const escrowAddress = decoded.outputs.find((o) => !o.isOpReturn && o.address)?.address;
        if (!escrowAddress) {
          buildError = "Could not read the escrow address from the presenter's transaction.";
        } else {
          myFragment = buildParticipantPsbt({
            utxo: joinedUtxo,
            escrowAddress,
            feeSats: perParticipantFee(feeRate),
          }).psbtBase64;
        }
      } catch (err) {
        buildError = err instanceof Error ? err.message : "Failed to build your transaction.";
      }
    }
    const inputFound = !!myFragment;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StepHeader stepLabel={needsSign ? "Sign transaction" : "Waiting"} />
        <div className="flex-1 flex flex-col justify-center px-4 py-8 max-w-md mx-auto w-full space-y-4">

          {/* Status summary */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-neon flex-shrink-0" />
              <span className="font-mono text-xs text-neon">In the lobby</span>
            </div>
            <div className="space-y-1 pl-6">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Bet</span>
                <span className="text-neon">{formatSats(betAmount)}</span>
              </div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">Address</span>
                <span className="text-foreground">
                  {joinedAddress.slice(0, 10)}...{joinedAddress.slice(-6)}
                </span>
              </div>
              {chosenWalletId && (
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Wallet</span>
                  <span className="text-neon uppercase">{chosenWalletId}</span>
                </div>
              )}
              {psbtSigned && (
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">PSBT</span>
                  <span className="text-neon">SIGNED</span>
                </div>
              )}
            </div>
          </div>

          {/* Waiting state: no PSBT yet */}
          {!hasPsbt && !psbtSigned && (
            <div className="bg-card border border-border rounded-lg p-6 text-center space-y-4">
              <motion.div
                className="w-10 h-10 border-2 border-neon border-t-transparent rounded-full mx-auto"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              />
              <div className="space-y-1">
                <div className="font-mono text-sm text-foreground">
                  Waiting for the presenter
                </div>
                <div className="font-mono text-xs text-muted-foreground leading-relaxed">
                  The presenter is waiting for all players to join, then will
                  build the PSBT. You will be prompted to sign it here.
                </div>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                Phase: {phase}
              </div>
            </div>
          )}

          {/* Sign PSBT — appears when publishedPsbt arrives */}
          {needsSign && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-neon/40 rounded-lg p-4 space-y-3"
              >
                <div className="space-y-1">
                  <div className="font-mono text-sm text-neon">
                    PSBT ready — sign your input
                  </div>
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    The presenter has built the transaction. Your wallet will
                    show you the exact amount and the escrow destination.
                    Review it carefully before approving.
                  </p>
                </div>

                {inputFound ? (
                  <WalletSelector
                    mode="sign-psbt"
                    psbtBase64={myFragment}
                    inputIndex={0}
                    betAmount={betAmount}
                    onSignComplete={handlePsbtSigned}
                    onManualSign={handlePsbtManual}
                  />
                ) : (
                  <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
                    <p className="font-mono text-xs text-glitch leading-relaxed">
                      {buildError ??
                        "Waiting for the presenter's transaction so we can read the escrow address."}
                    </p>
                  </div>
                )}

                {submitError && (
                  <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
                    <p className="font-mono text-xs text-glitch">{submitError}</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Signed — waiting for broadcast */}
          {psbtSigned && (
            <div className="bg-card border border-border rounded-lg p-6 text-center space-y-4">
              <motion.div
                className="w-10 h-10 border-2 border-neon border-t-transparent rounded-full mx-auto"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              />
              <div className="space-y-1">
                <div className="font-mono text-sm text-neon">Signature submitted</div>
                <div className="font-mono text-xs text-muted-foreground leading-relaxed">
                  Waiting for the presenter to finalize and broadcast Tx 1.
                  The result will appear here once the transaction confirms.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: result ────────────────────────────────────────────────────────
  if (step === "result" && result) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full space-y-4"
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

          {/* Feedback block */}
          <FeedbackBlock />

          {/* Creator contact — so players can reach out after the presentation */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="font-mono text-xs text-muted-foreground uppercase">
              Liked it? Get in touch
            </div>
            <div className="space-y-2">
              <a
                href="https://njump.me/npub1p2x3t3njq44vsk24qjkauzurvfd59c224qyu2mpgu9jverk9tfrqnz0ql5"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 bg-neon/10 border border-neon/30 rounded-lg hover:bg-neon/20 active:scale-95 transition-all"
              >
                <span className="font-mono text-xs text-neon uppercase w-20 flex-shrink-0">NOSTR</span>
                <span className="font-mono text-xs text-muted-foreground truncate">
                  npub1p2x3t3njq44v…
                </span>
              </a>
              <a
                href="https://t.me/arkano21"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 bg-neon/10 border border-neon/30 rounded-lg hover:bg-neon/20 active:scale-95 transition-all"
              >
                <span className="font-mono text-xs text-neon uppercase w-20 flex-shrink-0">TELEGRAM</span>
                <span className="font-mono text-xs text-muted-foreground truncate">
                  @arkano21
                </span>
              </a>
              <a
                href="https://github.com/arkano1dev/v0-entropy-roulette"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 bg-neon/10 border border-neon/30 rounded-lg hover:bg-neon/20 active:scale-95 transition-all"
              >
                <span className="font-mono text-xs text-neon uppercase w-20 flex-shrink-0">GITHUB</span>
                <span className="font-mono text-xs text-muted-foreground truncate">
                  arkano1dev/v0-entropy-roulette
                </span>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Render: result but no result data yet ─────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <motion.div
        className="w-10 h-10 border-2 border-neon border-t-transparent rounded-full"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
      />
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
