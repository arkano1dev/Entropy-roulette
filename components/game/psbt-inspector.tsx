"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getPsbtDetails, estimateTxSize, calculateFee } from "@/lib/bitcoin/psbt-engine";
import { formatSats, truncateTxid, truncateAddress } from "@/lib/bitcoin/wallet-connect";
import type { Player } from "@/lib/game/types";
import { ChevronDown, ChevronUp, Copy, CheckCircle, Clock, XCircle } from "lucide-react";

interface PSBTInspectorProps {
  psbtBase64: string;
  players: Player[];
  feeRate: number;
  phase: string;
}

export function PSBTInspector({ psbtBase64, players, feeRate, phase }: PSBTInspectorProps) {
  const [showRawHex, setShowRawHex] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!psbtBase64) {
    return (
      <div className="p-6 bg-card border border-border rounded-lg text-center">
        <div className="font-mono text-sm text-muted-foreground">
          No PSBT available yet
        </div>
      </div>
    );
  }

  let details;
  try {
    details = getPsbtDetails(psbtBase64);
  } catch {
    return (
      <div className="p-6 bg-card border border-border rounded-lg text-center">
        <div className="font-mono text-sm text-glitch">
          Failed to decode PSBT
        </div>
      </div>
    );
  }

  const estimatedVsize = estimateTxSize(details.inputCount, details.outputCount);
  const estimatedFee = calculateFee(details.inputCount, details.outputCount, feeRate);
  const actualFee = Number(details.feeSats);

  // Map players to inputs
  const inputRows = details.inputs.map((input, index) => {
    const player = players[index];
    const signed = player?.signedPsbt ? true : false;
    return {
      index,
      txid: input.txid,
      vout: input.vout,
      value: Number(input.value),
      signed,
      playerName: player?.displayName || `Input ${index}`,
    };
  });

  const handleCopyHex = () => {
    // PSBT base64 is already the payload; for raw hex we'd need to decode
    navigator.clipboard.writeText(psbtBase64);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allSigned = inputRows.every((r) => r.signed);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="font-mono text-sm text-neon uppercase tracking-wider">
          PSBT Inspector
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {psbtBase64.length.toLocaleString()} chars base64
        </div>
      </div>

      {/* Raw hex (collapsible) */}
      <div className="border-b border-border">
        <button
          onClick={() => setShowRawHex(!showRawHex)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
        >
          <span className="font-mono text-xs text-muted-foreground uppercase">
            Raw PSBT (Base64)
          </span>
          {showRawHex ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        <AnimatePresence>
          {showRawHex && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 bg-muted/20 relative">
                <pre className="font-mono text-[10px] text-muted-foreground break-all whitespace-pre-wrap max-h-48 overflow-auto">
                  {psbtBase64}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyHex}
                  className="absolute top-2 right-2 h-6 text-[10px] font-mono"
                >
                  {copied ? (
                    <CheckCircle className="w-3 h-3 text-neon" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Inputs table */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            Inputs ({details.inputCount})
          </span>
          <span className="font-mono text-xs text-memphis">
            Total: {formatSats(details.totalInputSats)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2 pr-2">#</th>
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2 pr-2">TXID</th>
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2 pr-2">vout</th>
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2 pr-2">Value</th>
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2">Signed</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((row) => (
                <motion.tr
                  key={row.index}
                  className="border-b border-border/50 last:border-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: row.index * 0.05 }}
                >
                  <td className="font-mono text-xs text-foreground py-2 pr-2">{row.index}</td>
                  <td className="font-mono text-xs text-neon py-2 pr-2">
                    {truncateTxid(row.txid, 6)}
                  </td>
                  <td className="font-mono text-xs text-foreground py-2 pr-2">{row.vout}</td>
                  <td className="font-mono text-xs text-memphis py-2 pr-2">
                    {formatSats(row.value)}
                  </td>
                  <td className="py-2">
                    {row.signed ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-neon">
                        <CheckCircle className="w-3 h-3" /> {row.playerName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <Clock className="w-3 h-3" /> {row.playerName}
                      </span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outputs table */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            Outputs ({details.outputCount})
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2 pr-2">Address</th>
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2 pr-2">Value</th>
                <th className="font-mono text-[10px] text-muted-foreground uppercase pb-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {details.outputs.map((output, index) => {
                const addr = output.address ?? null;
                const scriptType = output.isOpReturn
                  ? "OP_RETURN"
                  : !addr
                  ? "UNKNOWN"
                  : addr.startsWith("bc1q")
                  ? "P2WPKH"
                  : addr.startsWith("bc1p")
                  ? "P2TR"
                  : addr.startsWith("3")
                  ? "P2SH"
                  : "P2PKH";
                return (
                  <tr key={index} className="border-b border-border/50 last:border-0">
                    <td className="font-mono text-xs text-neon py-2 pr-2">
                      {output.isOpReturn
                        ? `OP_RETURN: ${output.opReturnText ?? ""}`
                        : addr
                        ? truncateAddress(addr, 10)
                        : "—"}
                    </td>
                    <td className="font-mono text-xs text-memphis py-2 pr-2">
                      {formatSats(Number(output.value))}
                    </td>
                    <td className="font-mono text-[10px] text-muted-foreground py-2">
                      {scriptType}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fee + metadata */}
      <div className="p-4 border-b border-border">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Fee</div>
            <div className="font-mono text-sm text-foreground">
              {formatSats(actualFee)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              ~{feeRate} sat/vB × {estimatedVsize} vB
            </div>
          </div>
          <div className="p-3 bg-muted/20 rounded-lg">
            <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Network</div>
            <div className="font-mono text-sm text-neon">Bitcoin Mainnet</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              Version 2 | Locktime 0
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              allSigned ? "bg-neon" : "bg-muted-foreground"
            }`}
          />
          <span className="font-mono text-[10px] text-muted-foreground">
            {allSigned
              ? "All inputs signed — ready for broadcast"
              : `${inputRows.filter((r) => r.signed).length}/${inputRows.length} signed`}
          </span>
        </div>
      </div>

      {/* Mini graph */}
      <div className="p-4">
        <MiniGraph players={players} allSigned={allSigned} phase={phase} />
      </div>
    </div>
  );
}

function MiniGraph({
  players,
  allSigned,
  phase,
}: {
  players: Player[];
  allSigned: boolean;
  phase: string;
}) {
  const centerX = 160;
  const centerY = 80;
  const radius = 55;

  const getPos = (index: number, total: number) => {
    const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  };

  return (
    <div className="w-full flex justify-center">
      <svg viewBox="0 0 320 160" className="w-full max-w-xs">
        {/* Lines */}
        {players.map((p, i) => {
          const pos = getPos(i, players.length);
          const signed = !!p.signedPsbt;
          return (
            <line
              key={p.id}
              x1={pos.x}
              y1={pos.y}
              x2={centerX}
              y2={centerY}
              stroke={signed ? "#00ff88" : "rgba(0,255,102,0.3)"}
              strokeWidth={signed ? 2 : 1}
              strokeDasharray={signed ? "none" : "4 2"}
            />
          );
        })}

        {/* Center */}
        <circle
          cx={centerX}
          cy={centerY}
          r={22}
          fill="rgba(0,255,102,0.15)"
          stroke={allSigned ? "#00ff88" : "#333"}
          strokeWidth={2}
        />
        <text
          x={centerX}
          y={centerY + 4}
          textAnchor="middle"
          fill="#00ff88"
          fontSize="10"
          fontFamily="monospace"
        >
          POT
        </text>

        {/* Player nodes */}
        {players.map((p, i) => {
          const pos = getPos(i, players.length);
          const signed = !!p.signedPsbt;
          return (
            <g key={p.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={14}
                fill={signed ? "rgba(0,255,102,0.2)" : "#141414"}
                stroke={signed ? "#00ff88" : "#333"}
                strokeWidth={2}
              />
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                fill={signed ? "#00ff88" : "#666"}
                fontSize="8"
                fontFamily="monospace"
              >
                {p.displayName.slice(0, 3).toUpperCase()}
              </text>
              {signed && (
                <circle
                  cx={pos.x + 10}
                  cy={pos.y - 10}
                  r={4}
                  fill="#00ff88"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
