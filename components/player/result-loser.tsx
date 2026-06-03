"use client";

import { motion } from "framer-motion";
import { formatSats } from "@/lib/bitcoin/wallet-connect";

interface ResultLoserProps {
  displayName: string;
  totalPot: number;
  txid: string;
  calculation: string;
  winnerName: string;
  inputIndex: number;
  onDonate?: () => void;
}

export function ResultLoser({
  displayName,
  totalPot,
  txid,
  calculation,
  winnerName,
  inputIndex,
  onDonate,
}: ResultLoserProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-glitch/10 flex flex-col items-center justify-center p-8 relative overflow-hidden"
    >
      {/* Glitch effect background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-glitch/5"
          animate={{
            opacity: [0.05, 0.1, 0.05],
            x: [-2, 2, -2],
          }}
          transition={{ duration: 0.1, repeat: Infinity }}
        />
      </div>

      {/* Main content */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="relative z-10 text-center max-w-md mx-auto"
      >
        {/* Error icon */}
        <motion.div
          className="mb-6"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 0.5, repeat: 3 }}
        >
          <svg
            className="w-20 h-20 mx-auto text-glitch"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </motion.div>

        {/* Title */}
        <motion.h1
          className="font-mono text-3xl text-glitch mb-2"
          animate={{
            textShadow: [
              "2px 0 #00FF66, -2px 0 #FF003C",
              "-2px 0 #00FF66, 2px 0 #FF003C",
              "2px 0 #00FF66, -2px 0 #FF003C",
            ],
          }}
          transition={{ duration: 0.2, repeat: 3 }}
        >
          SYSTEM FAILURE
        </motion.h1>

        <p className="font-mono text-lg text-glitch/80 mb-2">
          YOUR SATS HAVE BEEN REALLOCATED
        </p>

        <p className="font-mono text-sm text-muted-foreground mb-8">
          Thanks for the beer.
        </p>

        {/* Technical explanation */}
        <div className="bg-background/80 border border-glitch/50 rounded-lg p-6 mb-6 text-left">
          <div className="font-mono text-sm text-glitch mb-4">
            What just happened?
          </div>

          <div className="space-y-3 font-mono text-xs text-muted-foreground">
            <p>
              You participated in a collaborative PSBT (Partially Signed Bitcoin
              Transaction).
            </p>

            <p>
              You provided <span className="text-neon">Input #{inputIndex}</span>{" "}
              worth <span className="text-memphis">{formatSats(totalPot / 4)}</span>,
              but Output #0 ({formatSats(totalPot)}) was assigned to{" "}
              <span className="text-neon">{winnerName}</span>.
            </p>

            <div className="p-3 bg-muted/30 rounded mt-4">
              <div className="text-muted-foreground mb-1">Entropy calculation:</div>
              <div className="text-neon break-all">{calculation}</div>
            </div>

            <p className="text-xs mt-4 italic">
              This is why privacy matters. Your inputs are now forever linked to
              this transaction. Consider using coinjoin for future UTXOs.
            </p>
          </div>
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
            className="font-mono text-sm text-glitch hover:underline break-all"
          >
            {txid}
          </a>
        </div>

        {/* Donate button */}
        {onDonate && (
          <motion.button
            onClick={onDonate}
            className="px-6 py-3 border border-muted-foreground text-muted-foreground font-mono text-sm rounded-lg hover:border-neon hover:text-neon transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            SUPPORT THE PROJECT
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
