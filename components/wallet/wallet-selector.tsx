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
  isUnisatAvailable,
  isLeatherAvailable,
  isAlbyAvailable,
  connectUnisatWallet,
  connectLeatherWallet,
  connectAlbyWallet,
  signMessageWithUnisat,
  signMessageWithLeather,
  signMessageWithAlby,
  signPsbtWithUnisat,
  signPsbtWithLeather,
  signPsbtWithAlby,
  downloadPsbtFile,
  psbtBase64ToHex,
  truncateAddress,
} from "@/lib/bitcoin/wallet-connect";
import {
  connectXverseWallet,
  signMessageWithXverse,
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
  isAvailable: () => boolean;
}

const WALLET_DEFS: WalletDef[] = [
  {
    id: "xverse",
    name: "Xverse",
    description: "Extension / mobile",
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
    description: "Extension / Alby Hub",
    type: "extension",
    Logo: AlbyLogo,
    installUrl:
      "https://chrome.google.com/webstore/detail/alby/iokeahhehimjnekafflcihljlcjccdbe",
    isAvailable: isAlbyAvailable,
  },
  {
    id: "sparrow",
    name: "Sparrow",
    description: "Desktop — PSBT file",
    type: "desktop",
    Logo: SparrowLogo,
    installUrl: "https://sparrowwallet.com/download/",
    isAvailable: () => false,
  },
  {
    id: "bluewallet",
    name: "BlueWallet",
    description: "Mobile — PSBT file",
    type: "mobile",
    Logo: BlueWalletLogo,
    installUrl: "https://bluewallet.io",
    isAvailable: () => false,
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
// Exported types
// ---------------------------------------------------------------------------

export interface WalletSignResult {
  /** base64 signed PSBT — returned by extension wallets */
  signedPsbt?: string;
  address: string;
  walletId: WalletId;
  /** Signature from the sign-message step */
  messageSignature?: string;
  /** For file-based flow: PSBT was downloaded; user must re-upload */
  needsUpload?: boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WalletSelectorProps {
  /**
   * "sign-message" — prove wallet ownership before joining (no PSBT needed yet).
   * "sign-psbt"    — sign the actual game PSBT once it has been published.
   */
  mode: "sign-message" | "sign-psbt";
  /** The PSBT to sign — only needed when mode === "sign-psbt" */
  psbtBase64?: string | null;
  /** Player's input index inside the PSBT */
  inputIndex?: number;
  betAmount: number;
  /** Called when message or PSBT has been signed */
  onSignComplete: (result: WalletSignResult) => void;
  /** Called when user wants address-only (manual) entry */
  onManualSign: (address: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WalletSelector({
  mode,
  psbtBase64 = null,
  inputIndex = 0,
  betAmount,
  onSignComplete,
  onManualSign,
}: WalletSelectorProps) {
  const [detectedWallets, setDetectedWallets] = useState<Set<WalletId>>(
    new Set()
  );
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
    if (detected.size === 1) setSelected([...detected][0]);
  }, []);

  const wallet = selected ? WALLET_DEFS.find((w) => w.id === selected) : null;
  const isExtension = wallet?.type === "extension";
  const isFileBased =
    wallet?.type === "desktop" || wallet?.type === "mobile";
  const isManual = wallet?.type === "manual";

  const MESSAGE_TO_SIGN = "I want to play Entropy Roulette";

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

  // Step B-sign-message: prove ownership
  const handleSignMessage = async () => {
    if (!selected || !connectedAddress) return;
    setError(null);
    setIsSigning(true);
    try {
      let signature = "";
      switch (selected) {
        case "xverse":
          signature = await signMessageWithXverse(MESSAGE_TO_SIGN, connectedAddress);
          break;
        case "unisat": {
          const r = await signMessageWithUnisat(MESSAGE_TO_SIGN);
          signature = r.signature;
          break;
        }
        case "leather": {
          const r = await signMessageWithLeather(MESSAGE_TO_SIGN);
          signature = r.signature;
          break;
        }
        case "alby": {
          const r = await signMessageWithAlby(MESSAGE_TO_SIGN);
          signature = r.signature;
          break;
        }
        default:
          break;
      }
      onSignComplete({
        address: connectedAddress,
        walletId: selected,
        messageSignature: signature,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setIsSigning(false);
    }
  };

  // Step B-sign-psbt: sign the game PSBT
  const handleSignPsbt = async () => {
    if (!selected || !psbtBase64 || !connectedAddress) return;
    setError(null);
    setIsSigning(true);
    try {
      let signedPsbt = "";
      switch (selected) {
        case "xverse":
          signedPsbt = await signPlayerPsbt(psbtBase64, connectedAddress, inputIndex);
          break;
        case "unisat": {
          const hex = psbtBase64ToHex(psbtBase64);
          const signedHex = await signPsbtWithUnisat(hex, { autoFinalized: false });
          signedPsbt = btoa(
            signedHex
              .match(/.{1,2}/g)!
              .map((b) => String.fromCharCode(parseInt(b, 16)))
              .join("")
          );
          break;
        }
        case "leather":
          signedPsbt = await signPsbtWithLeather(psbtBase64, inputIndex);
          break;
        case "alby":
          signedPsbt = await signPsbtWithAlby(psbtBase64, inputIndex);
          break;
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

  const actionLabel =
    mode === "sign-message"
      ? `Sign with ${wallet?.name ?? "wallet"}`
      : `Sign PSBT with ${wallet?.name ?? "wallet"}`;

  const signHandler =
    mode === "sign-message" ? handleSignMessage : handleSignPsbt;
  const signDisabled =
    isSigning ||
    (mode === "sign-psbt" && !psbtBase64);
  const signWaiting = mode === "sign-psbt" && !psbtBase64;

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
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      `Connect ${wallet?.name}`
                    )}
                  </Button>
                )}

                {connectedAddress && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-neon/10 border border-neon/30 rounded-lg">
                      <span className="font-mono text-xs text-muted-foreground">
                        Connected
                      </span>
                      <span className="font-mono text-xs text-neon">
                        {truncateAddress(connectedAddress, 10)}
                      </span>
                    </div>

                    {signWaiting ? (
                      <div className="p-3 bg-muted/20 rounded-lg text-center font-mono text-xs text-muted-foreground">
                        Waiting for presenter to publish PSBT...
                      </div>
                    ) : (
                      <Button
                        onClick={signHandler}
                        disabled={signDisabled}
                        className="w-full bg-neon text-background hover:bg-neon/80 font-mono py-5"
                      >
                        {isSigning ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Signing...
                          </>
                        ) : (
                          actionLabel
                        )}
                      </Button>
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
                {mode === "sign-message" ? (
                  // File wallets can't sign messages in-browser — ask for address
                  <div className="p-3 bg-muted/20 border border-border rounded-lg">
                    <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                      {wallet?.name} does not support in-browser message
                      signing. Enter your receiving address below to join — you
                      will sign your PSBT input later using a downloaded file.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-muted/20 border border-border rounded-lg">
                      <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                        {wallet?.name === "Sparrow"
                          ? "Download the PSBT file, open it in Sparrow (File → Open Transaction), sign your input, and return the signed file to the presenter."
                          : "Download the PSBT file and open it in BlueWallet via Send → PSBT to sign your input."}
                      </p>
                    </div>

                    {psbtBase64 ? (
                      <Button
                        onClick={handleDownload}
                        className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {downloadDone
                          ? `Downloaded — sign in ${wallet?.name}`
                          : "Download PSBT file"}
                      </Button>
                    ) : (
                      <div className="p-3 bg-muted/20 rounded-lg text-center font-mono text-xs text-muted-foreground">
                        Waiting for presenter to publish PSBT...
                      </div>
                    )}

                    {downloadDone && (
                      <div className="p-3 bg-neon/10 border border-neon/30 rounded-lg">
                        <p className="font-mono text-xs text-neon">
                          After signing in {wallet?.name}, give the signed PSBT
                          to the presenter.
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
                  </>
                )}

                {/* Always show address entry for file wallets */}
                <ManualAddressEntry
                  label="Your Bitcoin address (for payout)"
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
