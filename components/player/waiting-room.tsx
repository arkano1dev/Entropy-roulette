"use client";

import { motion } from "framer-motion";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import type { GamePhase } from "@/lib/game/types";

interface WaitingRoomProps {
  phase: GamePhase;
  playerCount: number;
  totalPot: number;
  playerPosition: number;
  displayName: string;
}

export function WaitingRoom({
  phase,
  playerCount,
  totalPot,
  playerPosition,
  displayName,
}: WaitingRoomProps) {
  const getStatusMessage = () => {
    switch (phase) {
      case "LOBBY_OPEN":
        return "Waiting for more players...";
      case "LOBBY_CLOSED":
        return "Lobby closed. Preparing signatures...";
      case "COLLECTING_SIGNATURES":
        return "Collecting signatures from all players...";
      case "FINALIZED":
        return "PSBT finalized. Awaiting broadcast...";
      case "BROADCAST":
        return "Transaction in mempool. Waiting for confirmation...";
      default:
        return "Processing...";
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Animated background pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at center, rgba(0,255,102,0.1) 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 4, repeat: Infinity }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center max-w-sm w-full">
        {/* Player info */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="font-mono text-xs text-muted-foreground mb-1">
            YOUR IDENTITY
          </div>
          <div className="font-mono text-xl text-neon">{displayName}</div>
          <div className="font-mono text-xs text-muted-foreground mt-1">
            Input #{playerPosition}
          </div>
        </motion.div>

        {/* Animated loader */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          <motion.div
            className="absolute inset-0 border-2 border-neon/30 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-2 border-2 border-neon/50 rounded-full"
            animate={{ rotate: -360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-4 border-2 border-neon rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span
              className="font-mono text-2xl text-neon"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {playerCount}
            </motion.span>
          </div>
        </div>

        {/* Status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="font-mono text-xs text-muted-foreground mb-2">
            STATUS
          </div>
          <motion.p
            className="font-mono text-sm text-neon"
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {getStatusMessage()}
          </motion.p>
        </motion.div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="bg-muted/20 rounded-lg p-4">
            <div className="font-mono text-xs text-muted-foreground mb-1">
              PLAYERS
            </div>
            <div className="font-mono text-2xl text-neon">{playerCount}</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-4">
            <div className="font-mono text-xs text-muted-foreground mb-1">
              TOTAL POT
            </div>
            <div className="font-mono text-lg text-memphis">
              {formatSats(totalPot)}
            </div>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="mt-8">
          <div className="flex items-center justify-center gap-2">
            {["LOBBY", "SIGN", "BROADCAST", "CONFIRM"].map((step, index) => {
              const phaseIndex = {
                LOBBY_OPEN: 0,
                LOBBY_CLOSED: 0,
                COLLECTING_SIGNATURES: 1,
                FINALIZED: 1,
                BROADCAST: 2,
                CONFIRMED: 3,
                COMPLETE: 3,
              }[phase] ?? 0;

              const isActive = index <= phaseIndex;
              const isCurrent = index === phaseIndex;

              return (
                <div key={step} className="flex items-center">
                  <motion.div
                    className={`w-3 h-3 rounded-full ${isActive ? "bg-neon" : "bg-muted"}`}
                    animate={isCurrent ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  {index < 3 && (
                    <div
                      className={`w-8 h-0.5 ${isActive ? "bg-neon/50" : "bg-muted"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 px-1">
            {["LOBBY", "SIGN", "BROADCAST", "CONFIRM"].map((step) => (
              <span
                key={step}
                className="font-mono text-[10px] text-muted-foreground"
              >
                {step}
              </span>
            ))}
          </div>
        </div>

        {/* Warning */}
        <motion.p
          className="mt-8 font-mono text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Do not close this window. Your phone will vibrate when action is
          required.
        </motion.p>
      </div>
    </div>
  );
}
