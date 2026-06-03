"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  isSatsConnectAvailable,
  connectXverseWallet,
  disconnectXverseWallet,
} from "@/lib/bitcoin/sats-connect";
import { truncateAddress } from "@/lib/bitcoin/wallet-connect";
import { Wallet } from "lucide-react";

export interface PlayerWalletState {
  connected: boolean;
  address: string;
  publicKey: string;
}

interface XverseConnectPlayerProps {
  onConnect: (state: PlayerWalletState) => void;
  onDisconnect: () => void;
  connectedState?: PlayerWalletState;
}

export function XverseConnectPlayer({
  onConnect,
  onDisconnect,
  connectedState,
}: XverseConnectPlayerProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available =
    typeof window !== "undefined" ? isSatsConnectAvailable() : false;

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const wallet = await connectXverseWallet();
      onConnect({
        connected: true,
        address: wallet.address,
        publicKey: wallet.publicKey,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, [onConnect]);

  const handleDisconnect = useCallback(async () => {
    await disconnectXverseWallet();
    onDisconnect();
  }, [onDisconnect]);

  if (!available) {
    return (
      <div className="p-4 bg-glitch/10 border border-glitch/30 rounded-lg">
        <div className="font-mono text-sm text-glitch mb-2">
          XVERSE NOT DETECTED
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Please install the Xverse browser extension and refresh the page.
        </p>
      </div>
    );
  }

  if (!connectedState?.connected) {
    return (
      <div className="space-y-4">
        <Button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
          size="lg"
        >
          {isConnecting ? (
            <motion.div
              className="w-5 h-5 border-2 border-background border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
          ) : (
            <>
              <Wallet className="w-5 h-5 mr-2" />
              CONNECT XVERSE WALLET
            </>
          )}
        </Button>
        {error && (
          <p className="font-mono text-xs text-glitch text-center">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          {truncateAddress(connectedState.address, 12)}
        </div>
      </div>

      <Button
        onClick={handleDisconnect}
        variant="outline"
        className="w-full font-mono text-xs"
      >
        DISCONNECT WALLET
      </Button>

      {error && (
        <p className="font-mono text-xs text-glitch text-center">{error}</p>
      )}
    </div>
  );
}
