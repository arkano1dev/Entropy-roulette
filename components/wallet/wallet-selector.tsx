"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  SUPPORTED_WALLETS,
  WalletInfo,
  getAvailableExtensionWallets,
  getMobileWallets,
  QRScanLogo,
} from "./wallet-logos";

interface WalletSelectorProps {
  psbtBase64: string;
  betAmount: number;
  onSignComplete: (signedPsbt: string) => void;
  onManualSign: () => void;
}

export function WalletSelector({
  psbtBase64,
  betAmount,
  onSignComplete,
  onManualSign,
}: WalletSelectorProps) {
  const [selectedWallet, setSelectedWallet] = useState<WalletInfo | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"select" | "sign">("select");

  const extensionWallets = getAvailableExtensionWallets();
  const mobileWallets = getMobileWallets();

  const handleWalletSelect = async (wallet: WalletInfo) => {
    setSelectedWallet(wallet);

    if (wallet.type === "extension" && wallet.isAvailable?.()) {
      // Try to sign with extension
      setIsLoading(true);
      try {
        const provider = (window as any).bitcoin;
        if (provider?.signPsbt) {
          const signedPsbt = await provider.signPsbt(psbtBase64);
          onSignComplete(signedPsbt);
        }
      } catch (err) {
        console.error("Extension signing failed:", err);
        setStep("sign");
      } finally {
        setIsLoading(false);
      }
    } else if (wallet.type === "mobile" && wallet.deepLink) {
      // Open deep link for mobile wallet
      setStep("sign");
    } else {
      setStep("sign");
    }
  };

  const handleOpenWallet = () => {
    if (selectedWallet?.deepLink) {
      const deepLink = selectedWallet.deepLink(psbtBase64);
      window.location.href = deepLink;
    }
  };

  const handleShowQR = () => {
    setShowQR(true);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {step === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Extension wallets */}
            {extensionWallets.length > 0 && (
              <div>
                <h3 className="font-mono text-xs text-muted-foreground mb-3 uppercase tracking-wider">
                  Browser Extensions Detected
                </h3>
                <div className="grid gap-3">
                  {extensionWallets.map((wallet) => (
                    <WalletCard
                      key={wallet.id}
                      wallet={wallet}
                      isSelected={selectedWallet?.id === wallet.id}
                      isLoading={isLoading && selectedWallet?.id === wallet.id}
                      onClick={() => handleWalletSelect(wallet)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Mobile wallets */}
            <div>
              <h3 className="font-mono text-xs text-muted-foreground mb-3 uppercase tracking-wider">
                Mobile Wallets
              </h3>
              <div className="grid gap-3">
                {mobileWallets.map((wallet) => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    isSelected={selectedWallet?.id === wallet.id}
                    onClick={() => handleWalletSelect(wallet)}
                  />
                ))}
              </div>
            </div>

            {/* Manual QR option */}
            <div>
              <h3 className="font-mono text-xs text-muted-foreground mb-3 uppercase tracking-wider">
                Other Options
              </h3>
              <motion.button
                onClick={() => {
                  setSelectedWallet(null);
                  setShowQR(true);
                  setStep("sign");
                }}
                className="w-full p-4 rounded-lg border border-border bg-card hover:border-neon/50 transition-all flex items-center gap-4"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <QRScanLogo className="w-12 h-12" />
                <div className="text-left">
                  <div className="font-mono text-sm text-foreground">
                    Scan QR Code
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    Use any PSBT-compatible wallet
                  </div>
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === "sign" && (
          <motion.div
            key="sign"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {selectedWallet && (
              <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-lg">
                <selectedWallet.logo className="w-12 h-12" />
                <div>
                  <div className="font-mono text-sm text-neon">
                    {selectedWallet.name}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {selectedWallet.description}
                  </div>
                </div>
              </div>
            )}

            {/* Deep link button for mobile */}
            {selectedWallet?.deepLink && (
              <Button
                onClick={handleOpenWallet}
                className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-6"
              >
                Open {selectedWallet.name}
              </Button>
            )}

            {/* QR Code */}
            {(showQR || !selectedWallet?.deepLink) && (
              <div className="space-y-4">
                <div className="p-4 bg-white rounded-lg mx-auto w-fit">
                  <QRCodeSVG
                    value={
                      selectedWallet?.deepLink
                        ? selectedWallet.deepLink(psbtBase64)
                        : `bitcoin:?psbt=${encodeURIComponent(psbtBase64)}`
                    }
                    size={200}
                    level="M"
                    includeMargin
                  />
                </div>
                <p className="font-mono text-xs text-center text-muted-foreground">
                  Scan with your wallet app to sign the PSBT
                </p>
              </div>
            )}

            {/* Show QR toggle */}
            {selectedWallet?.deepLink && !showQR && (
              <Button
                variant="outline"
                onClick={handleShowQR}
                className="w-full font-mono"
              >
                Show QR Code Instead
              </Button>
            )}

            {/* Instructions */}
            <div className="p-4 bg-muted/10 rounded-lg border border-border">
              <h4 className="font-mono text-xs text-neon mb-2 uppercase">
                How to sign:
              </h4>
              <ol className="font-mono text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Open your wallet app</li>
                <li>
                  {selectedWallet?.deepLink
                    ? "The PSBT will open automatically"
                    : "Scan the QR code above"}
                </li>
                <li>Review the transaction details</li>
                <li>Sign the PSBT (do NOT broadcast)</li>
                <li>Return here and confirm</li>
              </ol>
            </div>

            {/* Confirmation */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                className="flex-1 font-mono"
              >
                Back
              </Button>
              <Button
                onClick={onManualSign}
                className="flex-1 bg-neon text-background hover:bg-neon/80 font-mono"
              >
                I Have Signed
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Individual wallet card component
function WalletCard({
  wallet,
  isSelected,
  isLoading,
  onClick,
}: {
  wallet: WalletInfo;
  isSelected: boolean;
  isLoading?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={isLoading}
      className={`w-full p-4 rounded-lg border-2 transition-all flex items-center gap-4 ${
        isSelected
          ? "border-neon bg-neon/10"
          : "border-border bg-card hover:border-neon/50"
      }`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <wallet.logo className="w-12 h-12" />
      <div className="text-left flex-1">
        <div className="font-mono text-sm text-foreground flex items-center gap-2">
          {wallet.name}
          {wallet.type === "extension" && wallet.isAvailable?.() && (
            <span className="px-1.5 py-0.5 text-[10px] bg-neon/20 text-neon rounded">
              DETECTED
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {wallet.description}
        </div>
      </div>
      {isLoading && (
        <div className="w-5 h-5 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      )}
    </motion.button>
  );
}
