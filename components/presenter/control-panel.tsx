"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import type { GamePhase } from "@/lib/game/types";
import { getPhaseDisplayName, getPhaseDescription } from "@/lib/game/state";

interface ControlPanelProps {
  phase: GamePhase;
  playerCount: number;
  signedCount: number;
  onOpenLobby: () => void;
  onCloseLobby: () => void;
  onCollectSignatures: () => void;
  onFinalize: () => void;
  onBroadcast: () => void;
  isLoading?: boolean;
}

export function ControlPanel({
  phase,
  playerCount,
  signedCount,
  onOpenLobby,
  onCloseLobby,
  onCollectSignatures,
  onFinalize,
  onBroadcast,
  isLoading,
}: ControlPanelProps) {
  // All joined players have signed (a solo presenter with 0 players can finalize
  // too — the presenter signs their own input #0 as part of finalize).
  const allSigned = signedCount === playerCount;

  return (
    <div className="bg-background/80 border border-border rounded-lg p-6">
      {/* Phase indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <motion.div
            className="w-3 h-3 rounded-full bg-neon"
            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="font-mono text-lg text-neon">
            {getPhaseDisplayName(phase)}
          </span>
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          {getPhaseDescription(phase)}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-muted/30 rounded-lg p-4 text-center">
          <div className="font-mono text-3xl text-neon">{playerCount}</div>
          <div className="font-mono text-xs text-muted-foreground">PLAYERS</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 text-center">
          <div className="font-mono text-3xl text-neon">
            {signedCount}/{playerCount}
          </div>
          <div className="font-mono text-xs text-muted-foreground">SIGNED</div>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex flex-col gap-3">
        {phase === "IDLE" && (
          <Button
            onClick={onOpenLobby}
            disabled={isLoading}
            className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
            size="lg"
          >
            INITIALIZE ENTROPY
          </Button>
        )}

        {phase === "LOBBY_OPEN" && (
          <>
            <Button
              onClick={onCollectSignatures}
              disabled={isLoading || playerCount === 0}
              className="w-full bg-memphis text-background hover:bg-memphis/80 font-mono disabled:opacity-50"
              size="lg"
            >
              BUILD PSBT & COLLECT SIGNATURES
            </Button>
            <Button
              onClick={onCloseLobby}
              disabled={isLoading}
              variant="outline"
              className="w-full font-mono"
              size="sm"
            >
              FREEZE PLAYER LIST
            </Button>
            <p className="font-mono text-xs text-center text-muted-foreground">
              {playerCount === 0
                ? "Open — waiting for players to sign in"
                : `${playerCount} player${playerCount === 1 ? "" : "s"} in — build anytime`}
            </p>
          </>
        )}

        {phase === "LOBBY_CLOSED" && (
          <Button
            onClick={onCollectSignatures}
            disabled={isLoading}
            className="w-full bg-memphis text-background hover:bg-memphis/80 font-mono"
            size="lg"
          >
            COLLECT SIGNATURES
          </Button>
        )}

        {phase === "COLLECTING_SIGNATURES" && (
          <Button
            onClick={onFinalize}
            disabled={isLoading || !allSigned}
            className="w-full bg-neon text-background hover:bg-neon/80 font-mono disabled:opacity-50"
            size="lg"
          >
            {allSigned ? "FINALIZE PSBT" : `WAITING... (${signedCount}/${playerCount})`}
          </Button>
        )}

        {phase === "FINALIZED" && (
          <Button
            onClick={onBroadcast}
            disabled={isLoading}
            className="w-full bg-neon text-background hover:bg-neon/80 font-mono animate-pulse"
            size="lg"
          >
            BROADCAST TO MEMPOOL
          </Button>
        )}

        {phase === "BROADCAST" && (
          <div className="text-center">
            <motion.div
              className="font-mono text-neon text-lg mb-2"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              AWAITING CONFIRMATION...
            </motion.div>
            <p className="font-mono text-xs text-muted-foreground">
              Transaction is in the mempool. Waiting for block confirmation.
            </p>
          </div>
        )}

        {(phase === "CONFIRMED" || phase === "COMPLETE") && (
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="font-mono text-neon text-xl mb-2"
            >
              ENTROPY RESOLVED
            </motion.div>
            <p className="font-mono text-xs text-muted-foreground">
              The block has spoken. The winner has been chosen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
