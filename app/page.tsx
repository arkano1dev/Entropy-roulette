"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AutoGlitchText } from "@/components/ui/glitch-text";
import {
  XverseLogo,
  BlueWalletLogo,
  SparrowLogo,
  AlbyLogo,
  LeatherLogo,
} from "@/components/wallet/wallet-logos";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [typedText, setTypedText] = useState("");
  const fullText = "> INITIALIZING ENTROPY FIELD...";

  useEffect(() => {
    setMounted(true);
  }, []);

  // Typing effect
  useEffect(() => {
    if (!mounted) return;

    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setTypedText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="font-mono text-neon animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col">
      {/* Header */}
      <header className="p-6 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          <span className="font-mono text-xs text-muted-foreground">
            MAINNET
          </span>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          v0.1.0-alpha
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-2xl"
        >
          {/* Logo/Title */}
          <motion.h1
            className="font-mono text-5xl md:text-7xl text-neon mb-4 neon-glow"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
          >
            <AutoGlitchText interval={8000}>ENTROPY</AutoGlitchText>
          </motion.h1>
          <motion.h2
            className="font-mono text-3xl md:text-5xl text-foreground mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            ROULETTE
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            className="font-mono text-lg text-muted-foreground mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            A PSBT Collaborative Transaction Game
          </motion.p>

          <motion.p
            className="font-mono text-sm text-muted-foreground mb-12 max-w-md mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            Contribute your input. Sign your PSBT. Let Bitcoin&apos;s entropy
            decide. The blockchain is the only fair judge.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
          >
            <Link href="/presenter">
              <Button
                size="lg"
                className="bg-neon text-background hover:bg-neon/80 font-mono text-lg px-8 py-6 neon-pulse"
              >
                HOST A GAME
              </Button>
            </Link>
            <Link href="/player">
              <Button
                size="lg"
                variant="outline"
                className="font-mono text-lg px-8 py-6 border-neon/50 hover:border-neon hover:bg-neon/10"
              >
                JOIN AS PLAYER
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* How it works */}
        <motion.div
          className="mt-16 max-w-4xl w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
        >
          <h3 className="font-mono text-center text-neon text-sm mb-8 uppercase tracking-wider">
            How It Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                step: 1,
                title: "Scan QR",
                desc: "Join the game from the presenter screen",
              },
              {
                step: 2,
                title: "Choose Bet",
                desc: "Select how many sats to wager",
              },
              {
                step: 3,
                title: "Sign PSBT",
                desc: "Sign with your Bitcoin wallet",
              },
              {
                step: 4,
                title: "Win or Lose",
                desc: "Entropy decides the winner",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                className="relative p-4 border border-border/50 rounded-lg bg-card/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 + i * 0.1 }}
              >
                <div className="absolute -top-3 left-4 bg-background px-2">
                  <span className="font-mono text-neon text-xs">
                    0{item.step}
                  </span>
                </div>
                <div className="font-mono text-sm text-foreground mb-1 mt-1">
                  {item.title}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Supported Wallets */}
        <motion.div
          className="mt-12 max-w-4xl w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <h3 className="font-mono text-center text-muted-foreground text-xs mb-6 uppercase tracking-wider">
            Supported Wallets
          </h3>
          <div className="flex flex-wrap justify-center gap-6 items-center">
            <div className="flex flex-col items-center gap-2">
              <XverseLogo className="w-10 h-10" />
              <span className="font-mono text-xs text-muted-foreground">
                Xverse
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <BlueWalletLogo className="w-10 h-10" />
              <span className="font-mono text-xs text-muted-foreground">
                BlueWallet
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SparrowLogo className="w-10 h-10" />
              <span className="font-mono text-xs text-muted-foreground">
                Sparrow
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AlbyLogo className="w-10 h-10" />
              <span className="font-mono text-xs text-muted-foreground">
                Alby
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <LeatherLogo className="w-10 h-10" />
              <span className="font-mono text-xs text-muted-foreground">
                Leather
              </span>
            </div>
            <div className="flex flex-col items-center gap-2 opacity-60">
              <div className="w-10 h-10 rounded-lg border border-dashed border-muted-foreground flex items-center justify-center">
                <span className="font-mono text-xs text-muted-foreground">
                  +
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                Any PSBT
              </span>
            </div>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.7 }}
        >
          <div className="p-6 border border-border/50 rounded-lg bg-card/50">
            <div className="font-mono text-neon text-sm mb-2">01. PSBT</div>
            <p className="font-mono text-xs text-muted-foreground">
              Multiple players contribute inputs to a single partially signed
              Bitcoin transaction. No trusted coordinator required.
            </p>
          </div>
          <div className="p-6 border border-border/50 rounded-lg bg-card/50">
            <div className="font-mono text-neon text-sm mb-2">02. NOSTR</div>
            <p className="font-mono text-xs text-muted-foreground">
              Game state synchronized via Nostr relays. Decentralized
              coordination, ephemeral events, real-time updates.
            </p>
          </div>
          <div className="p-6 border border-border/50 rounded-lg bg-card/50">
            <div className="font-mono text-neon text-sm mb-2">03. ENTROPY</div>
            <p className="font-mono text-xs text-muted-foreground">
              Winner determined by TXID % player_count. Verifiable randomness
              from Bitcoin&apos;s proof of work. No manipulation possible.
            </p>
          </div>
        </motion.div>

        {/* Educational note */}
        <motion.div
          className="mt-12 max-w-2xl text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.9 }}
        >
          <div className="p-6 border border-neon/30 bg-neon/5 rounded-lg">
            <h4 className="font-mono text-neon text-sm mb-2">
              Perfect for Bitcoin Education
            </h4>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Entropy Roulette is designed for conferences, meetups, and
              workshops. The presenter view includes educational slides
              explaining PSBTs, transaction construction, and how Bitcoin&apos;s
              entropy provides verifiable randomness. Players learn by doing.
            </p>
          </div>
        </motion.div>
      </main>

      {/* Footer terminal */}
      <footer className="p-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="font-mono text-xs text-neon">
            {typedText}
            <motion.span
              className="inline-block w-2 h-4 bg-neon ml-1"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>Bitcoin Mainnet | Real Sats | Real Risk</span>
            <span>
              Built for{" "}
              <a
                href="https://bitcoinconference.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neon hover:underline"
              >
                Bitcoin 2025
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
