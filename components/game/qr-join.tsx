"use client";

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";

interface QRJoinProps {
  gameId: string;
  playerCount: number;
  isOpen: boolean;
}

export function QRJoin({ gameId, playerCount, isOpen }: QRJoinProps) {
  // Generate the join URL
  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/player?game=${gameId}`
      : `/player?game=${gameId}`;

  return (
    <div className="bg-background/80 border border-border rounded-lg p-6 flex flex-col items-center">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <motion.div
          className={`w-2 h-2 rounded-full ${isOpen ? "bg-neon" : "bg-glitch"}`}
          animate={isOpen ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span className="font-mono text-sm text-neon">
          {isOpen ? "ACCEPTING PLAYERS" : "LOBBY CLOSED"}
        </span>
      </div>

      {/* QR Code */}
      <motion.div
        className="relative p-4 bg-white rounded-lg"
        animate={isOpen ? { boxShadow: ["0 0 20px rgba(0,255,102,0.3)", "0 0 40px rgba(0,255,102,0.5)", "0 0 20px rgba(0,255,102,0.3)"] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <QRCodeSVG
          value={joinUrl}
          size={200}
          level="M"
          bgColor="#FFFFFF"
          fgColor="#0A0A0A"
        />
        {!isOpen && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <span className="font-mono text-glitch text-sm">CLOSED</span>
          </div>
        )}
      </motion.div>

      {/* Game ID */}
      <div className="mt-4 text-center">
        <div className="font-mono text-xs text-muted-foreground mb-1">
          GAME ID
        </div>
        <div className="font-mono text-lg text-neon tracking-widest">
          {gameId.toUpperCase()}
        </div>
      </div>

      {/* Player counter */}
      <div className="mt-4 flex items-center gap-3 px-4 py-2 bg-muted/30 rounded-lg">
        <span className="font-mono text-muted-foreground text-sm">PLAYERS:</span>
        <motion.span
          key={playerCount}
          initial={{ scale: 1.5, color: "#00FF66" }}
          animate={{ scale: 1, color: "#FFFFFF" }}
          className="font-mono text-xl"
        >
          {playerCount}
        </motion.span>
      </div>

      {/* Instructions */}
      <div className="mt-4 text-center">
        <p className="font-mono text-xs text-muted-foreground">
          Scan to join the entropy pool
        </p>
      </div>
    </div>
  );
}
