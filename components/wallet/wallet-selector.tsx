"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Download, Check, Loader2 } from "lucide-react";
import {
  XverseLogo,
  UnisatLogo,
  LeatherLogo,
  AlbyLogo,
  SparrowLogo,
  BlueWalletLogo,
} from "@/components/wallet/wallet-logos";
import {
  isXverseAvailable,
  isUnisatAvailable,
  isLeatherAvailable,
  isAlbyAvailable,
  connectUnisatWallet,
  connectLeatherWallet,
  connectAlbyWallet,
  signPsbtWithUnisat,
  signPsbtWithLeather,
  signPsbtWithAlby,
  downloadPsbtFile,
  psbtBase64ToHex,
  truncateAddress,
} from "@/lib/bitcoin/wallet-connect";
import {
  connectXverseWallet,
  signPlayerPsbt,
  isSatsConnectAvailable,
} from "@/lib/bitcoin/sats-connect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WalletId =
  | "xverse"
  | "unisat"
  | "leather"
  | "alby"
  | "sparrow"
  | "bluewallet"
  | "manual";

interface WalletDef {
  id: WalletId;
  name: string;
  description: string;
  type: "extension" | "mobile" | "desktop" | "manual";
  Logo: React.ComponentType<{ className?: string }>;
  installUrl?: string;
  /** Returns true when the wallet can be used right now */
  isAvailable: () => boolean;
}

const WALLET_DEFS: WalletDef[] = [
  {
    id: "xverse",
    name: "Xverse",
    description: "Browser extension / mobile",
    type: "extension",
    Logo: XverseLogo,
    installUrl:
      "https://chrome.google.com/webstore/detail/xverse-wallet/idnnbdplmphpflfnlkomgpfbpcgelopg",
    isAvailable: isSatsConnectAvailable,
  },
  {
    id: "unisat",
    name: "Unisat",
    description: "Browser extension",
    type: "extension",
    Logo: UnisatLogo,
    installUrl:
      "https://chrome.google.com/webstore/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo",
    isAvailable: isUnisatAvailable,
  },
  {
    id: "leather",
    name: "Leather",
    description: "Browser extension",
    type: "extension",
    Logo: LeatherLogo,
    installUrl:
      "https://chrome.google.com/webstore/detail/leather/ldinpeekobnhjjdofggfgjlcehhmanlj",
    isAvailable: isLeatherAvailable,
  },
  {
    id: "alby",
    name: "Alby",
    description: "Browser extension / Alby Hub",
    type: "extension",
    Logo: AlbyLogo,
    installUrl:
      "https://chrome.google.com/webstore/detail/alby/iokeahhehimjnekafflcihljlcjccdbe",
    isAvailable: isAlbyAvailable,
  },
  {
    id: "sparrow",
    name: "Sparrow",
    description: "Desktop wallet — PSBT file import",
    type: "desktop",
    Logo: SparrowLogo,
    installUrl: "https://sparrowwallet.com/download/",
    isAvailable: () => false, // always file-based
  },
  {
    id: "bluewallet",
    name: "BlueWallet",
    description: "Mobile — PSBT file import",
    type: "mobile",
    Logo: BlueWalletLogo,
    installUrl: "https://bluewallet.io",
    isAvailable: () => false, // file / deep-link based
  },
  {
    id: "manual",
    name: "Address only",
    description: "Provide address, sign separately",
    type: "manual",
    Logo: () => (
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
        <span className="font-mono text-xs text-muted-foreground">bc1</span>
      </div>
    ),
    isAvailable: () => true,
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WalletSignResult {
  signedPsbt?: string;   // base64 — returned by extension wallets
  address: string;
  walletId: WalletId;
  /** For file-based flow: PSBT was downloaded; user must re-upload */
  needsUpload?: boolean;
}

interface WalletSelectorProps {
  /** The PSBT to be signed — may be null while waiting for presenter */
  psbtBase64: string | null;
  /** Player's input index inside the PSBT */
  inputIndex?: number;
  betAmount: number;
  onSignComplete: (result: WalletSignResult) => void;
  onManualSign: (address: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WalletSelector({
  psbtBase64,
  inputIndex = 0,
  betAmount,
  onSignComplete,
  onManualSign,
}: WalletSelectorProps) {
  const [detectedWallets, setDetectedWallets] = useState<Set<WalletId>>(new Set());
  const [selected, setSelected] = useState<WalletId | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [downloadDone, setDownloadDone] = useState(false);

  // Detect installed wallets on mount
  useEffect(() => {
    const detected = new Set<WalletId>();
    if (isSatsConnectAvailable()) detected.add("xverse");
    if (isUnisatAvailable()) detected.add("unisat");
    if (isLeatherAvailable()) detected.add("leather");
    if (isAlbyAvailable()) detected.add("alby");
    setDetectedWallets(detected);

    // Auto-select if exactly one extension wallet detected
    if (detected.size === 1) {
      setSelected([...detected][0]);
    }
  }, []);

  const wallet = selected ? WALLET_DEFS.find((w) => w.id === selected) : null;
  const isExtension = wallet?.type === "extension";
  const isFileBased = wallet?.type === "desktop" || wallet?.type === "mobile";
  const isManual = wallet?.type === "manual";

  // Step A: connect wallet (get address)
  const handleConnect = async () => {
    if (!selected) return;
    setError(null);
    setIsConnecting(true);
    try {
      let address = "";
      switch (selected) {
        case "xverse": {
          const info = await connectXverseWallet();
          address = info.address;
          break;
        }
        case "unisat": {
          const info = await connectUnisatWallet();
          address = info.address;
          break;
        }
        case "leather": {
          const info = await connectLeatherWallet();
          address = info.address;
          break;
        }
        case "alby": {
          const info = await connectAlbyWallet();
          address = info.address;
          break;
        }
        default:
          break;
      }
      setConnectedAddress(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  // Step B: sign PSBT
  const handleSign = async () => {
    if (!selected || !psbtBase64 || !connectedAddress) return;
    setError(null);
    setIsSigning(true);
    try {
      let signedPsbt = "";
      switch (selected) {
        case "xverse": {
          signedPsbt = await signPlayerPsbt(psbtBase64, connectedAddress, inputIndex);
          break;
        }
        case "unisat": {
          const hex = psbtBase64ToHex(psbtBase64);
          const signedHex = await signPsbtWithUnisat(hex, { autoFinalized: false });
          // Convert signed hex back to base64
          signedPsbt = btoa(
            signedHex.match(/.{1,2}/g)!.map((b) => String.fromCharCode(parseInt(b, 16))).join("")
          );
          break;
        }
        case "leather": {
          signedPsbt = await signPsbtWithLeather(psbtBase64, inputIndex);
          break;
        }
        case "alby": {
          signedPsbt = await signPsbtWithAlby(psbtBase64, inputIndex);
          break;
        }
        default:
          break;
      }

      onSignComplete({ signedPsbt, address: connectedAddress, walletId: selected });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setIsSigning(false);
    }
  };

  // File-based: download PSBT
  const handleDownload = () => {
    if (!psbtBase64) return;
    downloadPsbtFile(psbtBase64, "entropy-roulette.psbt");
    setDownloadDone(true);
  };

  return (
    <div className="w-full space-y-5">
      {/* Wallet grid */}
      <div>
        <p className="font-mono text-xs text-muted-foreground mb-3 uppercase">
          Choose your wallet
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WALLET_DEFS.map((def) => {
            const isDetected = detectedWallets.has(def.id);
            const isChosen = selected === def.id;
            return (
              <button
                key={def.id}
                onClick={() => {
                  setSelected(def.id);
                  setConnectedAddress(null);
                  setError(null);
                  setDownloadDone(false);
                }}
                className={`relative flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  isChosen
                    ? "border-neon bg-neon/10"
                    : "border-border bg-muted/10 hover:border-neon/50"
                }`}
              >
                <def.Logo className="w-8 h-8 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-mono text-sm text-foreground leading-tight">
                    {def.name}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground leading-tight truncate">
                    {def.description}
                  </div>
                </div>
                {isDetected && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-neon" />
                )}
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[10px] text-muted-foreground mt-2">
          Green dot = detected in your browser
        </p>
      </div>

      {/* Per-wallet action area */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {/* --- Extension wallets --- */}
            {isExtension && (
              <>
                {!detectedWallets.has(selected) && wallet?.installUrl && (
                  <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
                    <p className="font-mono text-xs text-glitch mb-2">
                      {wallet.name} not detected in this browser.
                    </p>
                    <a
                      href={wallet.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-neon hover:underline"
                    >
                      Install {wallet.name}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {detectedWallets.has(selected) && !connectedAddress && (
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
                  >
                    {isConnecting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
                    ) : (
                      `Connect ${wallet?.name}`
                    )}
                  </Button>
                )}

                {connectedAddress && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-neon/10 border border-neon/30 rounded-lg">
                      <span className="font-mono text-xs text-muted-foreground">Connected</span>
                      <span className="font-mono text-xs text-neon">
                        {truncateAddress(connectedAddress, 10)}
                      </span>
                    </div>

                    {psbtBase64 ? (
                      <Button
                        onClick={handleSign}
                        disabled={isSigning}
                        className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-5"
                      >
                        {isSigning ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing...</>
                        ) : (
                          `Sign PSBT with ${wallet?.name}`
                        )}
                      </Button>
                    ) : (
                      <div className="p-3 bg-muted/20 rounded-lg text-center font-mono text-xs text-muted-foreground">
                        Waiting for presenter to publish PSBT...
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setConnectedAddress(null);
                        setSelected(null);
                      }}
                      className="w-full font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      Change wallet
                    </button>
                  </div>
                )}
              </>
            )}

            {/* --- File-based wallets (Sparrow, BlueWallet) --- */}
            {isFileBased && (
              <div className="space-y-3">
                <div className="p-3 bg-muted/20 border border-border rounded-lg">
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    {wallet?.name === "Sparrow"
                      ? "Sparrow is a desktop wallet. Download the PSBT file, open it in Sparrow (File → Open Transaction), sign your input, and export the signed PSBT."
                      : "BlueWallet supports PSBT files. Download the file and open it in BlueWallet using the Send → PSBT workflow."}
                  </p>
                </div>

                {psbtBase64 ? (
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {downloadDone ? "Downloaded — sign in " + wallet?.name : "Download PSBT file"}
                  </Button>
                ) : (
                  <div className="p-3 bg-muted/20 rounded-lg text-center font-mono text-xs text-muted-foreground">
                    Waiting for presenter to publish PSBT...
                  </div>
                )}

                {downloadDone && (
                  <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg space-y-2">
                    <p className="font-mono text-xs text-neon">
                      After signing in {wallet?.name}, give the signed PSBT to the presenter.
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      The presenter will combine all signatures and broadcast.
                    </p>
                  </div>
                )}

                {wallet?.installUrl && (
                  <a
                    href={wallet.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-neon"
                  >
                    Get {wallet.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {/* Manual address entry for file wallets so we can register the player */}
                <ManualAddressEntry
                  label="Your receiving address (for payout if you win)"
                  onSubmit={(addr) => onManualSign(addr)}
                  betAmount={betAmount}
                />
              </div>
            )}

            {/* --- Manual / address-only --- */}
            {isManual && (
              <ManualAddressEntry
                label="Enter your Bitcoin address"
                onSubmit={(addr) => onManualSign(addr)}
                betAmount={betAmount}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="p-3 bg-glitch/10 border border-glitch/30 rounded-lg">
          <p className="font-mono text-xs text-glitch">{error}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManualAddressEntry helper
// ---------------------------------------------------------------------------

function ManualAddressEntry({
  label,
  onSubmit,
  betAmount,
}: {
  label: string;
  onSubmit: (address: string) => void;
  betAmount: number;
}) {
  const [value, setValue] = useState("");
  const valid = /^(bc1|3|1)[a-zA-Z0-9]{25,}/.test(value.trim());

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="font-mono text-[10px] text-muted-foreground uppercase">
          {label}
        </label>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="bc1q... or 3... or 1..."
          className="font-mono text-sm"
        />
      </div>
      <Button
        onClick={() => onSubmit(value.trim())}
        disabled={!valid}
        className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
      >
        <Check className="w-4 h-4 mr-2" />
        Join with this address
      </Button>
    </div>
  );
}
