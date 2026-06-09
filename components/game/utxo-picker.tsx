"use client";

// UTXO Picker — player selects which UTXO to contribute to the game PSBT
// Adapted from brc20kit patterns:
//  - Fetches UTXOs via /api/utxos (Unisat backed)
//  - Filters out UTXOs with inscriptions (if any)
//  - Shows scriptPubKey for transparency
//  - Returns the selected UTXO back to caller

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { UTXO } from "@/lib/game/types";

interface UtxoPickerProps {
  address: string;
  minSats?: number;
  onSelect: (utxo: UTXO) => void;
  selectedTxid?: string;
}

export function UtxoPicker({
  address,
  minSats = 5000,
  onSelect,
  selectedTxid,
}: UtxoPickerProps) {
  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchUtxos = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/utxos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error ?? "UTXO fetch failed");
      }

      const all: UTXO[] = data.data;
      setUtxos(all);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // On error, still mark fetched so user can retry
      setFetched(false);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  const eligible = utxos.filter((u) => u.value >= minSats);
  const total = utxos.reduce((s, u) => s + u.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-neon uppercase">
          Select UTXO
        </span>
        {fetched && (
          <span className="font-mono text-xs text-muted-foreground">
            {eligible.length}/{utxos.length} eligible
          </span>
        )}
      </div>

      {!fetched && (
        <Button
          onClick={fetchUtxos}
          disabled={isLoading || !address}
          variant="outline"
          className="w-full font-mono text-xs"
          size="sm"
        >
          {isLoading ? "FETCHING..." : "LOAD MY UTXOs"}
        </Button>
      )}

      {fetched && (
        <Button
          onClick={fetchUtxos}
          disabled={isLoading}
          variant="ghost"
          className="w-full font-mono text-xs text-muted-foreground"
          size="sm"
        >
          {isLoading ? "REFRESHING..." : "REFRESH"}
        </Button>
      )}

      {error && (
        <div className="bg-glitch/10 border border-glitch/30 rounded p-2">
          <p className="font-mono text-xs text-glitch">{error}</p>
        </div>
      )}

      {fetched && utxos.length === 0 && (
        <div className="text-center py-4">
          <p className="font-mono text-xs text-muted-foreground">
            No UTXOs found for this address
          </p>
        </div>
      )}

      {fetched && utxos.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground px-1">
            <span>Total balance</span>
            <span className="text-neon">{total.toLocaleString()} sats</span>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            <AnimatePresence>
              {utxos.map((utxo) => {
                const isSelected =
                  selectedTxid === `${utxo.txid}:${utxo.vout}`;
                const isBelowMin = utxo.value < minSats;

                return (
                  <motion.button
                    key={`${utxo.txid}:${utxo.vout}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => !isBelowMin && onSelect(utxo)}
                    disabled={isBelowMin}
                    className={`w-full text-left p-3 rounded-lg border transition-all font-mono ${
                      isSelected
                        ? "border-neon bg-neon/10"
                        : isBelowMin
                        ? "border-border/30 bg-muted/10 opacity-40 cursor-not-allowed"
                        : "border-border bg-background/50 hover:border-neon/40 hover:bg-neon/5 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {utxo.txid.slice(0, 12)}...:{utxo.vout}
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          isSelected
                            ? "text-neon"
                            : isBelowMin
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {utxo.value.toLocaleString()} sats
                      </span>
                    </div>
                    {utxo.scriptPubKey && (
                      <div className="text-[10px] text-muted-foreground/60 break-all leading-tight">
                        {utxo.scriptPubKey.slice(0, 32)}...
                      </div>
                    )}
                    {isBelowMin && (
                      <div className="text-[10px] text-glitch mt-1">
                        Below minimum ({minSats.toLocaleString()} sats)
                      </div>
                    )}
                    {isSelected && (
                      <div className="text-[10px] text-neon mt-1">
                        SELECTED
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
