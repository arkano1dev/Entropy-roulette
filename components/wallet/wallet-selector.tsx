"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  XverseConnectPlayer,
  type PlayerWalletState,
} from "@/components/player/xverse-connect";
import {
  isSatsConnectAvailable,
  signPlayerPsbt,
} from "@/lib/bitcoin/sats-connect";
import { truncateAddress } from "@/lib/bitcoin/wallet-connect";
import { discoverUTXOs, selectBestUTXO } from "@/lib/bitcoin/utxo";
import type { UTXO } from "@/lib/game/types";
import { AlertCircle, CheckCircle } from "lucide-react";

interface WalletSelectorProps {
  psbtBase64: string;
  betAmount: number;
  onSignComplete: (signedPsbt: string, receivingAddress: string) => void;
  onManualSign: (receivingAddress: string) => void;
}

export function WalletSelector({
  psbtBase64,
  betAmount,
  onSignComplete,
  onManualSign,
}: WalletSelectorProps) {
  const [walletState, setWalletState] = useState<PlayerWalletState | undefined>(
    undefined
  );
  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const [selectedUtxo, setSelectedUtxo] = useState<UTXO | null>(null);
  const [utxoError, setUtxoError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [step, setStep] = useState<"connect" | "utxo" | "sign" | "manual">("connect");

  const available =
    typeof window !== "undefined" ? isSatsConnectAvailable() : false;

  const handleWalletConnect = async (state: PlayerWalletState) => {
    setWalletState(state);
    setUtxoError(null);
    setIsDiscovering(true);

    try {
      const result = await discoverUTXOs(state.address, betAmount + 10000);
      if (result.utxos.length === 0) {
        setUtxoError(
          "You need funded UTXOs to play. Send sats to your Xverse address first."
        );
        setStep("manual");
        setIsDiscovering(false);
        return;
      }

      if (!result.hasEnough) {
        setUtxoError(
          `Your UTXO balance is only ${result.totalBalance.toLocaleString()} sats. You bet ${betAmount.toLocaleString()} sats. Need ${result.required.toLocaleString()} sats.`
        );
      }

      setUtxos(result.utxos);
      const best = selectBestUTXO(result.utxos, betAmount, 10000);
      setSelectedUtxo(best);
      setStep(best ? "sign" : "utxo");
    } catch (err) {
      setUtxoError(
        err instanceof Error ? err.message : "Failed to discover UTXOs"
      );
      setStep("manual");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSign = async () => {
    if (!walletState || !psbtBase64) return;
    setIsSigning(true);
    try {
      // Determine the player's input index (for now, single input assumed)
      const inputIndex = 0;
      const signed = await signPlayerPsbt(
        psbtBase64,
        walletState.address,
        inputIndex
      );
      onSignComplete(signed, walletState.address);
    } catch (err) {
      setUtxoError(
        err instanceof Error ? err.message : "Signing failed"
      );
    } finally {
      setIsSigning(false);
    }
  };

  if (!available) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-glitch/10 border border-glitch/30 rounded-lg">
          <div className="font-mono text-sm text-glitch mb-2">
            XVERSE NOT DETECTED
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Please install the Xverse browser extension and refresh the page.
          </p>
        </div>
        <ManualEntry
          onManualSign={onManualSign}
          betAmount={betAmount}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <AnimatePresence mode="wait">
        {step === "connect" && (
          <motion.div
            key="connect"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <XverseConnectPlayer
              onConnect={handleWalletConnect}
              onDisconnect={() => {
                setWalletState(undefined);
                setStep("connect");
              }}
              connectedState={walletState}
            />
            {isDiscovering && (
              <div className="text-center mt-4">
                <motion.div
                  className="w-5 h-5 border-2 border-neon border-t-transparent rounded-full mx-auto"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                />
                <p className="font-mono text-xs text-muted-foreground mt-2">
                  Discovering UTXOs via mempool.space...
                </p>
              </div>
            )}
          </motion.div>
        )}

        {step === "utxo" && (
          <motion.div
            key="utxo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="p-4 bg-card border border-border rounded-lg">
              <div className="font-mono text-xs text-neon mb-3 uppercase">
                SELECT UTXO
              </div>
              <div className="space-y-2">
                {utxos.map((utxo, i) => (
                  <button
                    key={`${utxo.txid}:${utxo.vout}`}
                    onClick={() => setSelectedUtxo(utxo)}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      selectedUtxo?.txid === utxo.txid &&
                      selectedUtxo?.vout === utxo.vout
                        ? "border-neon bg-neon/10"
                        : "border-border bg-muted/20 hover:border-neon/50"
                    }`}
                  >
                    <div className="font-mono text-xs text-neon">
                      {utxo.value.toLocaleString()} sats
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {truncateAddress(utxo.txid, 6)}:{utxo.vout}
                    </div>

                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={() => setStep("sign")}
              disabled={!selectedUtxo}
              className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
            >
              CONTINUE
            </Button>
          </motion.div>
        )}

        {step === "sign" && walletState && (
          <motion.div
            key="sign"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="p-4 bg-neon/10 border border-neon/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-muted-foreground">
                  WALLET
                </span>
                <span className="px-2 py-0.5 bg-neon/20 text-neon rounded font-mono text-[10px]">
                  CONNECTED
                </span>
              </div>
              <div className="font-mono text-sm text-neon">
                {truncateAddress(walletState.address, 12)}
              </div>
            </div>

            {selectedUtxo && (
              <div className="p-4 bg-card border border-border rounded-lg">
                <div className="font-mono text-xs text-neon mb-2">
                  SELECTED UTXO
                </div>
                <div className="font-mono text-xs text-foreground">
                  {selectedUtxo.value.toLocaleString()} sats
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {truncateAddress(selectedUtxo.txid, 8)}:{selectedUtxo.vout}
                </div>
              </div>
            )}

            {psbtBase64 ? (
              <Button
                onClick={handleSign}
                disabled={isSigning}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
                size="lg"
              >
                {isSigning ? "SIGNING..." : "SIGN PSBT WITH XVERSE"}
              </Button>
            ) : (
              <div className="p-4 bg-muted/20 rounded-lg text-center">
                <div className="font-mono text-xs text-muted-foreground">
                  Waiting for PSBT from presenter...
                </div>
              </div>
            )}

            <Button
              onClick={() => setStep("connect")}
              variant="outline"
              className="w-full font-mono text-xs"
            >
              BACK
            </Button>
          </motion.div>
        )}

        {step === "manual" && (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {utxoError && (
              <div className="p-4 bg-glitch/10 border border-glitch/30 rounded-lg mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-glitch" />
                  <span className="font-mono text-xs text-glitch">
                    UTXO ERROR
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {utxoError}
                </p>
              </div>
            )}
            <ManualEntry onManualSign={onManualSign} betAmount={betAmount} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ManualEntry({
  onManualSign,
  betAmount,
}: {
  onManualSign: (receivingAddress: string) => void;
  betAmount: number;
}) {
  const [manualAddress, setManualAddress] = useState("");

  return (
    <div className="space-y-4">
      <div className="p-4 bg-neon/10 border border-neon/30 rounded-lg">
        <h4 className="font-mono text-sm text-neon mb-2">
          Your Receiving Address
        </h4>
        <p className="font-mono text-xs text-muted-foreground mb-4 leading-relaxed">
          If you win, the prize will be sent directly to this address. Paste your
          Bitcoin address from your wallet.
        </p>
        <Input
          value={manualAddress}
          onChange={(e) => setManualAddress(e.target.value)}
          placeholder="bc1q... or 3... or 1..."
          className="font-mono text-sm"
        />
      </div>

      <div className="p-4 bg-muted/10 rounded-lg border border-border">
        <h4 className="font-mono text-xs text-neon mb-2 uppercase">
          How to get your address:
        </h4>
        <ol className="font-mono text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Open your Bitcoin wallet app</li>
          <li>Go to &quot;Receive&quot; or tap the receive button</li>
          <li>Copy your Bitcoin address</li>
          <li>Paste it above</li>
        </ol>
      </div>

      <Button
        onClick={() => onManualSign(manualAddress)}
        disabled={
          !manualAddress ||
          !manualAddress.match(/^(bc1|3|1)[a-zA-Z0-9]{25,}/)
        }
        className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
      >
        JOIN WITH THIS ADDRESS
      </Button>
    </div>
  );
}
