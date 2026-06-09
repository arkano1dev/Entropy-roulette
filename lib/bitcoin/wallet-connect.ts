"use client";

// Wallet connection utilities — multi-wallet support

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

// ---------------------------------------------------------------------------
// Wallet availability checks
// ---------------------------------------------------------------------------

export function isXverseAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).XverseProviders?.BitcoinProvider || !!(window as any).BitcoinProvider;
}

export function isUnisatAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).unisat;
}

export function isLeatherAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).LeatherProvider;
}

export function isAlbyAvailable(): boolean {
  if (typeof window === "undefined") return false;
  // Alby injects window.alby and also window.webln
  return !!(window as any).alby || !!(window as any).webln;
}

// ---------------------------------------------------------------------------
// Unisat wallet
// ---------------------------------------------------------------------------

export interface UnisatWalletInfo {
  address: string;
  publicKey: string;
}

export async function connectUnisatWallet(): Promise<UnisatWalletInfo> {
  const unisat = (window as any).unisat;
  if (!unisat) throw new Error("Unisat wallet not detected");

  const accounts: string[] = await unisat.requestAccounts();
  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned from Unisat");
  }

  const publicKey: string = await unisat.getPublicKey();
  return { address: accounts[0], publicKey };
}

export async function signPsbtWithUnisat(
  psbtHex: string,
  options?: { autoFinalized?: boolean }
): Promise<string> {
  const unisat = (window as any).unisat;
  if (!unisat) throw new Error("Unisat wallet not detected");
  // Unisat signPsbt accepts hex and returns signed hex
  const signed: string = await unisat.signPsbt(psbtHex, {
    autoFinalized: options?.autoFinalized ?? false,
  });
  return signed;
}

// ---------------------------------------------------------------------------
// Leather wallet
// ---------------------------------------------------------------------------

export interface LeatherWalletInfo {
  address: string;
  publicKey: string;
}

export async function connectLeatherWallet(): Promise<LeatherWalletInfo> {
  const leather = (window as any).LeatherProvider;
  if (!leather) throw new Error("Leather wallet not detected");

  const response = await leather.request("getAddresses", {
    types: ["p2wpkh", "p2tr"],
  });

  const addresses = response?.result?.addresses ?? [];
  const addr =
    addresses.find((a: any) => a.type === "p2wpkh") ?? addresses[0];
  if (!addr) throw new Error("No address returned from Leather");

  return { address: addr.address, publicKey: addr.publicKey ?? "" };
}

export async function signPsbtWithLeather(
  psbtBase64: string,
  signAtIndex: number
): Promise<string> {
  const leather = (window as any).LeatherProvider;
  if (!leather) throw new Error("Leather wallet not detected");

  const response = await leather.request("signPsbt", {
    hex: Buffer.from(psbtBase64, "base64").toString("hex"),
    signAtIndex,
    broadcast: false,
  });

  const signedHex: string = response?.result?.hex;
  if (!signedHex) throw new Error("Leather did not return a signed PSBT");
  return Buffer.from(signedHex, "hex").toString("base64");
}

// ---------------------------------------------------------------------------
// Alby wallet (WebLN / nostr-based — Bitcoin PSBT via webln.bitcoin or signPsbt)
// ---------------------------------------------------------------------------

export interface AlbyWalletInfo {
  address: string;
  publicKey: string;
}

export async function connectAlbyWallet(): Promise<AlbyWalletInfo> {
  const webln = (window as any).webln;
  if (!webln) throw new Error("Alby / WebLN not detected");

  await webln.enable();

  // Alby's webln.bitcoin extension (available from Alby Hub ≥ 0.6)
  const bitcoin = (window as any).alby?.bitcoin ?? webln?.bitcoin;
  if (!bitcoin?.getAddresses) {
    throw new Error(
      "Alby Bitcoin signing is not available. Update to Alby ≥ 0.6 or use the Alby Hub."
    );
  }

  const result = await bitcoin.getAddresses();
  const addr = result?.addresses?.[0];
  if (!addr) throw new Error("No address returned from Alby");

  return { address: addr.address, publicKey: addr.publicKey ?? "" };
}

export async function signPsbtWithAlby(
  psbtBase64: string,
  inputIndex: number
): Promise<string> {
  const webln = (window as any).webln;
  if (!webln) throw new Error("Alby / WebLN not detected");

  const bitcoin = (window as any).alby?.bitcoin ?? webln?.bitcoin;
  if (!bitcoin?.signPsbt) {
    throw new Error("Alby Bitcoin signing not available");
  }

  const response = await bitcoin.signPsbt({
    psbt: psbtBase64,
    inputs: [{ index: inputIndex }],
  });

  return response?.psbt ?? "";
}

// ---------------------------------------------------------------------------
// File download helper for desktop wallets (Sparrow, BlueWallet file import)
// ---------------------------------------------------------------------------

export function downloadPsbtFile(psbtBase64: string, filename = "entropy-roulette.psbt"): void {
  const bytes = Uint8Array.from(atob(psbtBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Convert base64 PSBT to hex (for wallets that prefer hex input)
export function psbtBase64ToHex(psbtBase64: string): string {
  return Array.from(
    Uint8Array.from(atob(psbtBase64), (c) => c.charCodeAt(0))
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
