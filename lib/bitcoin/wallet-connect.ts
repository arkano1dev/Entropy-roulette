// Wallet connection utilities for BIP-21 and browser extensions

// Browser extension interface (Alby, Xverse, Leather)
interface BitcoinProvider {
  signPsbt: (psbtBase64: string, options?: SignPsbtOptions) => Promise<string>;
  getAccounts?: () => Promise<string[]>;
  requestAccounts?: () => Promise<string[]>;
  signMessage?: (message: string, address: string) => Promise<string>;
}

interface SignPsbtOptions {
  autoFinalized?: boolean;
  inputsToSign?: Array<{ address: string; signingIndexes: number[] }>;
}

declare global {
  interface Window {
    bitcoin?: BitcoinProvider;
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: unknown) => Promise<unknown>;
    };
  }
}

// Check if browser extension wallet is available
export function hasWalletExtension(): boolean {
  return typeof window !== "undefined" && !!window.bitcoin;
}

// Get the wallet extension provider
export function getWalletProvider(): BitcoinProvider | null {
  if (typeof window === "undefined") return null;
  return window.bitcoin ?? null;
}

// Request wallet accounts
export async function requestWalletAccounts(): Promise<string[]> {
  const provider = getWalletProvider();
  if (!provider) {
    throw new Error("No wallet extension found");
  }

  if (provider.requestAccounts) {
    return provider.requestAccounts();
  }

  if (provider.getAccounts) {
    return provider.getAccounts();
  }

  throw new Error("Wallet does not support account listing");
}

// Sign a PSBT using browser extension
export async function signPsbtWithExtension(
  psbtBase64: string,
  options?: SignPsbtOptions
): Promise<string> {
  const provider = getWalletProvider();
  if (!provider) {
    throw new Error("No wallet extension found");
  }

  return provider.signPsbt(psbtBase64, options);
}

// Generate BIP-21 URI for mobile wallet scanning
export function generateBip21PaymentUri(
  address: string,
  amount?: number,
  label?: string,
  message?: string
): string {
  const params = new URLSearchParams();

  if (amount !== undefined) {
    // Convert sats to BTC
    params.set("amount", (amount / 100_000_000).toFixed(8));
  }

  if (label) {
    params.set("label", label);
  }

  if (message) {
    params.set("message", message);
  }

  const paramString = params.toString();
  return `bitcoin:${address}${paramString ? `?${paramString}` : ""}`;
}

// Generate BIP-21 URI with PSBT for signing
export function generatePsbtSigningUri(
  psbtBase64: string,
  label?: string
): string {
  const params = new URLSearchParams();
  params.set("psbt", psbtBase64);

  if (label) {
    params.set("label", label);
  }

  // Note: Some wallets expect the address to be empty for PSBT-only URIs
  return `bitcoin:?${params.toString()}`;
}

// Wallet type detection
export type WalletType = "alby" | "xverse" | "leather" | "unknown" | "none";

export function detectWalletType(): WalletType {
  if (typeof window === "undefined") return "none";

  const provider = window.bitcoin;
  if (!provider) return "none";

  // Try to detect specific wallet by checking provider properties
  // This is heuristic-based as wallets don't always identify themselves

  // Alby typically exposes additional webln methods
  if ("webln" in window) {
    return "alby";
  }

  // Check for wallet-specific identifiers
  const providerStr = provider.toString?.() || "";
  if (providerStr.includes("Xverse")) return "xverse";
  if (providerStr.includes("Leather")) return "leather";

  return "unknown";
}

// Get wallet display name
export function getWalletDisplayName(type: WalletType): string {
  switch (type) {
    case "alby":
      return "Alby";
    case "xverse":
      return "Xverse";
    case "leather":
      return "Leather";
    case "unknown":
      return "Browser Wallet";
    case "none":
      return "No Wallet";
  }
}

// Format sats for display
export function formatSats(sats: number): string {
  if (sats >= 100_000_000) {
    return `${(sats / 100_000_000).toFixed(8)} BTC`;
  }
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(2)}M sats`;
  }
  if (sats >= 1_000) {
    return `${(sats / 1_000).toFixed(1)}k sats`;
  }
  return `${sats} sats`;
}

// Format BTC amount
export function formatBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

// Truncate address for display
export function truncateAddress(address: string, chars = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Truncate txid for display
export function truncateTxid(txid: string, chars = 8): string {
  if (txid.length <= chars * 2 + 3) return txid;
  return `${txid.slice(0, chars)}...${txid.slice(-chars)}`;
}
