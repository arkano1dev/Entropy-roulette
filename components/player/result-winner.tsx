"use client";

import { motion } from "framer-motion";
import { formatSats } from "@/lib/bitcoin/wallet-connect";

interface ResultWinnerProps {
  displayName: string;
  totalPot: number;
  txid: string;
  calculation: string;
  receivingAddress?: string;
  onSweep?: () => void;
}

export function ResultWinner({
  displayName,
  totalPot,
  txid,
  calculation,
  receivingAddress,
  onSweep,
}: ResultWinnerProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-neon/10 flex flex-col items-center justify-center p-8 relative overflow-hidden"
    >
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 bg-neon/30"
            style={{
              left: `${Math.random() * 100}%`,
              height: `${Math.random() * 200 + 100}px`,
            }}
            initial={{ y: -200, opacity: 0 }}
            animate={{
              y: ["0vh", "100vh"],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: Math.random() * 2 + 1,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring" }}
        className="relative z-10 text-center"
      >
        {/* Crown icon */}
        <motion.div
          className="text-6xl mb-4"
          animate={{ y: [0, -10, 0], rotate: [-5, 5, -5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg
            className="w-24 h-24 mx-auto text-memphis"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h1
          className="font-mono text-4xl text-neon mb-2 tracking-wider"
          animate={{ textShadow: ["0 0 10px #00FF66", "0 0 30px #00FF66", "0 0 10px #00FF66"] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          THE BLOCK HAS CHOSEN YOU
        </motion.h1>

        <p className="font-mono text-xl text-neon/80 mb-8">
          YOUR UTXO IS SOVEREIGN
        </p>

        {/* Winner info */}
        <div className="bg-background/80 border-2 border-neon rounded-lg p-6 mb-6 max-w-md mx-auto">
          <div className="font-mono text-sm text-muted-foreground mb-2">
            WINNER
          </div>
          <div className="font-mono text-2xl text-neon mb-4">{displayName}</div>

          <div className="font-mono text-sm text-muted-foreground mb-2">
            PRIZE
          </div>
          <motion.div
            className="font-mono text-4xl text-memphis mb-4"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {formatSats(totalPot)}
          </motion.div>

          <div className="font-mono text-xs text-muted-foreground mb-1">
            ENTROPY CALCULATION
          </div>
          <div className="font-mono text-sm text-neon/70 break-all mb-4">
            {calculation}
          </div>

          {receivingAddress && (
            <>
              <div className="font-mono text-xs text-muted-foreground mb-1">
                FUNDS SENT TO
              </div>
              <div className="font-mono text-sm text-memphis/70 break-all">
                {receivingAddress}
              </div>
            </>
          )}
        </div>

        {/* TXID */}
        <div className="mb-6">
          <div className="font-mono text-xs text-muted-foreground mb-1">
            TRANSACTION ID
          </div>
          <a
            href={`https://mempool.space/tx/${txid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-neon hover:underline break-all"
          >
            {txid}
          </a>
        </div>

        {/* Sweep button */}
        {onSweep && (
          <motion.button
            onClick={onSweep}
            className="px-8 py-4 bg-neon text-background font-mono text-lg rounded-lg hover:bg-neon/80 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            SWEEP TO WALLET
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
