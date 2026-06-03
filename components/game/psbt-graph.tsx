"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Player } from "@/lib/game/types";
import { formatSats } from "@/lib/bitcoin/wallet-connect";

interface PSBTGraphProps {
  players: Player[];
  totalPot: number;
  winnerIndex?: number;
  phase: string;
}

export function PSBTGraph({
  players,
  totalPot,
  winnerIndex,
  phase,
}: PSBTGraphProps) {
  const centerX = 400;
  const centerY = 300;
  const radius = 200;

  // Calculate player positions in a circle
  const getPlayerPosition = (index: number, total: number) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  };

  const isConfirmed = phase === "CONFIRMED" || phase === "COMPLETE";

  return (
    <div className="relative w-full h-full min-h-[600px]">
      <svg
        viewBox="0 0 800 600"
        className="w-full h-full"
        style={{ filter: "drop-shadow(0 0 20px rgba(0, 255, 102, 0.2))" }}
      >
        {/* Background grid effect */}
        <defs>
          <pattern
            id="grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(0, 255, 102, 0.1)"
              strokeWidth="0.5"
            />
          </pattern>
          <radialGradient id="potGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0, 255, 102, 0.3)" />
            <stop offset="100%" stopColor="rgba(0, 255, 102, 0)" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Connection lines from players to center */}
        <AnimatePresence>
          {players.map((player, index) => {
            const pos = getPlayerPosition(index, players.length);
            const isWinner = winnerIndex === index && isConfirmed;
            const isSigned = !!player.signedPsbt;

            return (
              <motion.g key={player.id}>
                {/* Connection line */}
                <motion.line
                  x1={pos.x}
                  y1={pos.y}
                  x2={centerX}
                  y2={centerY}
                  stroke={
                    isWinner
                      ? "#00FF66"
                      : isSigned
                        ? "#00FF66"
                        : "rgba(0, 255, 102, 0.3)"
                  }
                  strokeWidth={isWinner ? 3 : isSigned ? 2 : 1}
                  strokeDasharray={isSigned ? "none" : "8 4"}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: 1,
                    strokeWidth: isWinner ? [3, 5, 3] : undefined,
                  }}
                  transition={{
                    pathLength: { duration: 0.8, delay: index * 0.1 },
                    strokeWidth: {
                      duration: 0.5,
                      repeat: isWinner ? Infinity : 0,
                    },
                  }}
                  filter={isWinner ? "url(#glow)" : undefined}
                />

                {/* Data flow particles */}
                {isSigned && (
                  <motion.circle
                    r={3}
                    fill="#00FF66"
                    initial={{ opacity: 0 }}
                    animate={{
                      cx: [pos.x, centerX],
                      cy: [pos.y, centerY],
                      opacity: [1, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: index * 0.3,
                      ease: "linear",
                    }}
                  />
                )}
              </motion.g>
            );
          })}
        </AnimatePresence>

        {/* Central pot node */}
        <motion.g filter="url(#glow)">
          <motion.circle
            cx={centerX}
            cy={centerY}
            r={60}
            fill="url(#potGradient)"
            stroke="#00FF66"
            strokeWidth={2}
            animate={{
              r: [60, 65, 60],
              strokeWidth: [2, 3, 2],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <text
            x={centerX}
            y={centerY - 10}
            textAnchor="middle"
            fill="#00FF66"
            fontSize="14"
            fontFamily="monospace"
          >
            POT
          </text>
          <text
            x={centerX}
            y={centerY + 15}
            textAnchor="middle"
            fill="#00FF66"
            fontSize="18"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {formatSats(totalPot)}
          </text>
        </motion.g>

        {/* Player nodes */}
        <AnimatePresence>
          {players.map((player, index) => {
            const pos = getPlayerPosition(index, players.length);
            const isWinner = winnerIndex === index && isConfirmed;
            const isSigned = !!player.signedPsbt;

            return (
              <motion.g
                key={player.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                {/* Player circle */}
                <motion.circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isWinner ? 35 : 30}
                  fill={isWinner ? "rgba(0, 255, 102, 0.2)" : "#0A0A0A"}
                  stroke={
                    isWinner ? "#00FF66" : isSigned ? "#00FF66" : "#333"
                  }
                  strokeWidth={isWinner ? 3 : 2}
                  filter={isWinner ? "url(#glow)" : undefined}
                  animate={
                    isWinner
                      ? {
                          r: [35, 40, 35],
                          strokeWidth: [3, 5, 3],
                        }
                      : {}
                  }
                  transition={{
                    duration: 0.8,
                    repeat: isWinner ? Infinity : 0,
                  }}
                />

                {/* Player index */}
                <text
                  x={pos.x}
                  y={pos.y - 8}
                  textAnchor="middle"
                  fill={isWinner ? "#00FF66" : isSigned ? "#00FF66" : "#666"}
                  fontSize="10"
                  fontFamily="monospace"
                >
                  INPUT {index}
                </text>

                {/* Player name */}
                <text
                  x={pos.x}
                  y={pos.y + 8}
                  textAnchor="middle"
                  fill={isWinner ? "#00FF66" : "#FFF"}
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {player.displayName.slice(0, 12)}
                </text>

                {/* Amount */}
                <text
                  x={pos.x}
                  y={pos.y + 22}
                  textAnchor="middle"
                  fill={isWinner ? "#00FF66" : "#999"}
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {formatSats(player.amount)}
                </text>

                {/* Signed indicator */}
                {isSigned && (
                  <motion.circle
                    cx={pos.x + 22}
                    cy={pos.y - 22}
                    r={6}
                    fill="#00FF66"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring" }}
                  />
                )}

                {/* Winner crown effect */}
                {isWinner && (
                  <motion.text
                    x={pos.x}
                    y={pos.y - 45}
                    textAnchor="middle"
                    fill="#FFD700"
                    fontSize="24"
                    initial={{ y: pos.y - 30, opacity: 0 }}
                    animate={{ y: pos.y - 45, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    WINNER
                  </motion.text>
                )}
              </motion.g>
            );
          })}
        </AnimatePresence>

        {/* Empty state */}
        {players.length === 0 && (
          <text
            x={centerX}
            y={centerY + 100}
            textAnchor="middle"
            fill="#666"
            fontSize="14"
            fontFamily="monospace"
          >
            Waiting for players to join...
          </text>
        )}
      </svg>
    </div>
  );
}
