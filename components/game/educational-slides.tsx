"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

interface EducationalSlide {
  id: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  icon?: React.ReactNode;
}

const PSBT_EDUCATIONAL_SLIDES: EducationalSlide[] = [
  {
    id: "what-is-bitcoin-tx",
    title: "A Bitcoin transaction, step by step",
    subtitle: "What actually happens when you send Bitcoin",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          Every Bitcoin transaction has two sides:{" "}
          <span className="text-neon">inputs</span> — coins you own and are
          spending — and <span className="text-neon">outputs</span> — where those
          coins are going. The Bitcoin network validates that your inputs are
          unspent and that your signature proves you own them.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="text-neon text-xs mb-1 uppercase">Inputs</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Coins you already received, called UTXOs — Unspent Transaction
              Outputs. Each one has a value in sats.
            </div>
          </div>
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="text-neon text-xs mb-1 uppercase">Outputs</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              Bitcoin addresses that will receive the funds. What&apos;s left
              after outputs and fees is returned to you as change.
            </div>
          </div>
        </div>
        <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
          <p className="text-xs text-muted-foreground leading-relaxed">
            A transaction is not valid until every input is cryptographically
            signed by the private key that owns it. No signature = no spend.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "what-is-psbt",
    title: "What is a PSBT?",
    subtitle: "Partially Signed Bitcoin Transaction — BIP 174",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          A <span className="text-neon">PSBT</span> is a standard format for a
          Bitcoin transaction that is not yet complete. It carries all the
          information needed to sign — inputs, outputs, amounts, derivation
          paths — without ever exposing private keys.
        </p>
        <div className="space-y-2">
          {[
            {
              label: "Constructed offline",
              desc: "The PSBT can be built and inspected without touching the Bitcoin network at all.",
            },
            {
              label: "Passed between devices",
              desc: "You can move a PSBT via QR code, file, or clipboard. Each party adds their signature.",
            },
            {
              label: "Finalized and broadcast",
              desc: "Once all required signatures are present the PSBT is finalized into a raw transaction and sent to the network.",
            },
          ].map((item) => (
            <div key={item.label} className="flex gap-3 p-3 bg-muted/20 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-neon mt-1.5 flex-shrink-0" />
              <div>
                <div className="text-xs text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "psbt-offline-phase",
    title: "The offline signing phase",
    subtitle: "Why this matters for self-custody",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          The most important property of a PSBT is that it is{" "}
          <span className="text-neon">signed completely offline</span>. Your
          private key never leaves your device and never touches the internet.
        </p>
        <div className="p-3 bg-muted/20 rounded-lg">
          <div className="font-mono text-xs text-neon mb-2">Signing flow</div>
          <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
            <div>1. Presenter builds the unsigned PSBT — all inputs, one output</div>
            <div>2. PSBT is shared with each player (in-browser or as a file)</div>
            <div>3. Each wallet inspects the PSBT and adds one signature</div>
            <div>4. Signatures are combined and the transaction is finalized</div>
            <div>5. The complete, signed transaction is broadcast to Bitcoin</div>
          </div>
        </div>
        <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your wallet will show you exactly what you are signing — the amount,
            the destination address, and the fee. Read it before you approve.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "entropy-selection",
    title: "How the winner is chosen",
    subtitle: "Verifiable randomness from the Bitcoin network",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          Once the transaction is mined, it receives a{" "}
          <span className="text-neon">TXID</span> — a 32-byte hash generated by
          the Bitcoin network from the transaction data. Nobody can predict or
          control it before the block is mined.
        </p>
        <div className="p-4 bg-muted/20 rounded-lg">
          <div className="text-xs text-muted-foreground mb-2">Winner formula</div>
          <code className="text-neon text-sm">
            last byte of TXID &nbsp;%&nbsp; number of players
          </code>
          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Example: last byte is <span className="text-memphis">0x42</span> (66
            decimal), five players → 66 % 5 ={" "}
            <span className="text-memphis">1</span> → Player 2 wins.
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The result is publicly verifiable on any block explorer. Anyone can
          reproduce the calculation using only the TXID.
        </p>
      </div>
    ),
  },
  {
    id: "your-safety",
    title: "What you are agreeing to",
    subtitle: "Read this before you sign",
    content: (
      <div className="space-y-3">
        <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
          <div className="text-xs text-neon mb-1">Your keys, your coins</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This application never sees your private key. Your wallet signs
            locally. You can inspect the exact transaction before approving.
          </p>
        </div>
        <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
          <div className="text-xs text-glitch mb-1">One input, one bet</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You are authorising your wallet to spend the UTXO you selected.
            The transaction sends that amount to the escrow pot. If you do not
            win, those sats go to the winner.
          </p>
        </div>
        <div className="p-3 bg-muted/20 rounded-lg">
          <div className="text-xs text-foreground mb-1">No refunds</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Once the transaction is broadcast and confirmed it cannot be
            reversed. Only bet what you are comfortable losing.
          </p>
        </div>
      </div>
    ),
  },
];

const PRESENTER_EDUCATIONAL_SLIDES: EducationalSlide[] = [
  {
    id: "intro-psbt-live",
    title: "This is a live PSBT",
    subtitle: "What we are about to do on Bitcoin mainnet",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          We are going to construct a real{" "}
          <span className="text-neon">Partially Signed Bitcoin Transaction</span>{" "}
          together, right now. Every player in this room will contribute an input.
          One transaction. Many signers. One winner.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="text-neon text-xs mb-1 uppercase">N inputs</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              One UTXO from each participant&apos;s wallet. Each input is
              authorised by that participant&apos;s private key only.
            </div>
          </div>
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="text-neon text-xs mb-1 uppercase">1 output</div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              All funds go to a single escrow address controlled by the
              presenter. This is Tx 1 — the pot.
            </div>
          </div>
        </div>
        <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
          <p className="text-xs text-muted-foreground leading-relaxed">
            No smart contract. No multisig script. Pure Bitcoin: each player
            signs their own input, and the network validates all signatures
            atomically when the transaction confirms.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "utxo-model",
    title: "UTXOs — the coin model",
    subtitle: "Bitcoin has no accounts, only unspent outputs",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          Bitcoin tracks value through{" "}
          <span className="text-neon">Unspent Transaction Outputs</span>. There
          are no balances. There are only coins, each identified by the TXID and
          output index (vout) of the transaction that created them.
        </p>
        <div className="p-3 bg-muted/20 rounded-lg font-mono text-xs space-y-1">
          <div className="text-muted-foreground">A UTXO looks like:</div>
          <div className="text-neon">txid: a1b2c3…f8e9</div>
          <div className="text-neon">vout: 0</div>
          <div className="text-neon">value: 25,000 sats</div>
          <div className="text-neon">scriptPubKey: OP_0 &lt;pubkeyHash&gt;</div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          To spend a UTXO you must provide a valid signature from the private
          key that matches the scriptPubKey. That signature is added to the
          PSBT input field — never shared with anyone else.
        </p>
      </div>
    ),
  },
  {
    id: "psbt-anatomy",
    title: "Inside a PSBT",
    subtitle: "What the file actually contains",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          A PSBT (BIP 174) is a key-value map. The global section holds the
          unsigned transaction skeleton. Each input section carries the data
          each signer needs to produce a valid signature.
        </p>
        <div className="space-y-2">
          {[
            {
              field: "UNSIGNED_TX",
              desc: "The transaction with empty scriptSigs / witnesses. Defines all inputs and outputs.",
            },
            {
              field: "WITNESS_UTXO",
              desc: "The previous output being spent — amount and scriptPubKey. Required for Segwit inputs so the signer can verify the amount.",
            },
            {
              field: "BIP32_DERIVATION",
              desc: "Tells hardware wallets which key to use without exposing the key itself.",
            },
            {
              field: "PARTIAL_SIG",
              desc: "Added by each signer. Once all inputs have a PARTIAL_SIG the PSBT can be finalized.",
            },
          ].map((row) => (
            <div key={row.field} className="flex gap-3 p-2 bg-muted/20 rounded">
              <code className="text-neon text-[10px] w-32 flex-shrink-0 pt-0.5">
                {row.field}
              </code>
              <div className="text-[10px] text-muted-foreground leading-relaxed">
                {row.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "psbt-roles",
    title: "PSBT roles",
    subtitle: "Five participants, one signed transaction",
    content: (
      <div className="space-y-3">
        <p className="leading-relaxed">
          BIP 174 defines distinct roles for every entity involved in
          constructing a PSBT. Each role adds information until the transaction
          is complete and can be broadcast.
        </p>
        <div className="space-y-2">
          {[
            {
              role: "Creator",
              color: "text-neon",
              bg: "bg-neon/10 border-neon/30",
              desc: "Proposes the transaction. Constructs the PSBT with inputs and outputs but no signatures or metadata yet.",
            },
            {
              role: "Updater",
              color: "text-neon",
              bg: "bg-neon/10 border-neon/30",
              desc: "Adds UTXO data for each input — amounts, scriptPubKeys, derivation paths — so signers can verify what they are spending.",
            },
            {
              role: "Signer",
              color: "text-memphis",
              bg: "bg-memphis/10 border-memphis/30",
              desc: "Inspects the transaction and produces a partial signature for inputs they own. Your wallet is the Signer.",
            },
            {
              role: "Finalizer",
              color: "text-neon",
              bg: "bg-neon/10 border-neon/30",
              desc: "Converts all partial signatures into the final scriptSig or witness for each input, once every Signer has contributed.",
            },
            {
              role: "Extractor",
              color: "text-neon",
              bg: "bg-neon/10 border-neon/30",
              desc: "Produces the valid network-format Bitcoin transaction from the finalized PSBT and broadcasts it.",
            },
          ].map((item) => (
            <div key={item.role} className={`flex gap-3 p-2 border rounded ${item.bg}`}>
              <span className={`font-mono text-[10px] w-20 flex-shrink-0 pt-0.5 uppercase ${item.color}`}>
                {item.role}
              </span>
              <span className="text-[10px] text-muted-foreground leading-relaxed">
                {item.desc}
              </span>
            </div>
          ))}
        </div>
        <div className="p-2 bg-muted/20 rounded text-[10px] text-muted-foreground leading-relaxed">
          A <span className="text-foreground">Combiner</span> can merge PSBTs
          from different Signers working in parallel — enabling the multi-party
          workflow we use in this game.
        </div>
      </div>
    ),
  },
  {
    id: "offline-then-online",
    title: "Offline, then online",
    subtitle: "The critical trust boundary",
    content: (
      <div className="space-y-4">
        <p className="leading-relaxed">
          The key insight of PSBT is that{" "}
          <span className="text-neon">construction and signing are separated</span>.
          The PSBT exists completely offline until every required signature is
          collected. Only the final raw transaction needs to touch the network.
        </p>
        <div className="space-y-2">
          {[
            { label: "OFFLINE", items: ["Build PSBT", "Inspect inputs / outputs", "Add each signature", "Combine all signatures"] },
            { label: "ONLINE", items: ["Finalize → extract raw hex", "Broadcast to mempool", "Wait for confirmation", "Read entropy from TXID"] },
          ].map((col) => (
            <div key={col.label} className="p-3 bg-muted/20 rounded-lg">
              <div className={`font-mono text-xs mb-2 ${col.label === "OFFLINE" ? "text-neon" : "text-memphis"}`}>
                {col.label}
              </div>
              {col.items.map((item) => (
                <div key={item} className="text-xs text-muted-foreground leading-relaxed">
                  — {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "two-transactions",
    title: "Two transactions, no circular dep",
    subtitle: "Why the winner is chosen this way",
    content: (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
            <div className="text-neon text-xs mb-1">Tx 1 — the pot</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All player inputs → single output to presenter&apos;s escrow
              address. Once confirmed, the TXID is fixed and public.
            </p>
          </div>
          <div className="p-3 bg-memphis/10 border border-memphis/30 rounded-lg">
            <div className="text-memphis text-xs mb-1">Entropy formula</div>
            <code className="text-xs text-foreground block mt-1">
              winner_index = last_byte(Tx1_TXID) % player_count
            </code>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              The last byte is determined by the mining process — it cannot be
              predicted before the block is found.
            </p>
          </div>
          <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
            <div className="text-neon text-xs mb-1">Tx 2 — the payout</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Presenter builds and signs Tx 2 from their wallet: escrow UTXO
              (Tx1:0) → winner&apos;s address. No dependency on Tx 2 when signing Tx 1.
            </p>
          </div>
        </div>
      </div>
    ),
  },
];

interface EducationalSlidesProps {
  slides?: EducationalSlide[];
  variant?: "player" | "presenter";
  onComplete?: () => void;
  showControls?: boolean;
  /** Extra classes on the root wrapper — use to override max-width or add height. */
  className?: string;
}

export function EducationalSlides({
  slides,
  variant = "player",
  onComplete,
  showControls = true,
  className,
}: EducationalSlidesProps) {
  const slideSet =
    slides ||
    (variant === "presenter"
      ? PRESENTER_EDUCATIONAL_SLIDES
      : PSBT_EDUCATIONAL_SLIDES);

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < slideSet.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete?.();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const currentSlide = slideSet[currentIndex];

  return (
    <div className={`w-full flex flex-col ${className ?? "max-w-2xl mx-auto"}`}>
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-4 flex-shrink-0">
        {slideSet.map((slide, i) => (
          <button
            key={slide.id}
            onClick={() => setCurrentIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === currentIndex
                ? "bg-neon w-6"
                : i < currentIndex
                  ? "bg-neon/50 w-2"
                  : "bg-muted w-2"
            }`}
          />
        ))}
      </div>

      {/* Slide content — flex-1 so it fills remaining vertical space */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="flex-1 bg-card border border-border rounded-lg p-8 flex flex-col overflow-auto"
        >
          <h2 className="font-mono text-2xl text-neon mb-1 flex-shrink-0">
            {currentSlide.title}
          </h2>
          {currentSlide.subtitle && (
            <p className="font-mono text-base text-muted-foreground mb-6 flex-shrink-0">
              {currentSlide.subtitle}
            </p>
          )}
          <div className="font-mono text-sm text-foreground leading-relaxed flex-1">
            {currentSlide.content}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      {showControls && (
        <div className="flex justify-between items-center mt-4 flex-shrink-0">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="font-mono"
          >
            Previous
          </Button>
          <span className="font-mono text-sm text-muted-foreground">
            {currentIndex + 1} / {slideSet.length}
          </span>
          <Button
            onClick={handleNext}
            className="font-mono bg-neon text-background hover:bg-neon/80"
          >
            {currentIndex === slideSet.length - 1 ? "Get Started" : "Next"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Mini educational tooltip
export function EducationalTooltip({
  term,
  explanation,
  children,
}: {
  term: string;
  explanation: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="border-b border-dotted border-neon cursor-help"
      >
        {children}
      </span>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-card border border-border rounded-lg shadow-lg z-50"
          >
            <div className="font-mono text-xs text-neon mb-1">{term}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {explanation}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
