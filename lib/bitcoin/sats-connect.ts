"use client";

// SatsConnect / Xverse integration wrapper
import { request } from "sats-connect";
import type { BitcoinProvider } from "sats-connect";

// Wallet info after connection
export interface XverseWalletInfo {
  address: string;
  publicKey: string;
  type: "payment" | "ordinals";
}

// Check if SatsConnect provider is available
export function isSatsConnectAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "XverseProviders" in window ||
    !!(window as any).BitcoinProvider ||
    !!(window as any).bitcoin
  );
}

// Get the Xverse Bitcoin provider
export function getXverseProvider(): BitcoinProvider | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).XverseProviders?.BitcoinProvider ??
    (window as any).BitcoinProvider ??
    null
  );
}

// Connect wallet and get payment address
export async function connectXverseWallet(): Promise<XverseWalletInfo> {
  const response = await request("wallet_connect", {
    addresses: ["payment"],
  });

  if (response.status === "error") {
    throw new Error(response.error?.message || "Wallet connection failed");
  }

  const addr = response.result.addresses[0];
  if (!addr) {
    throw new Error("No payment address returned from wallet");
  }

  return {
    address: addr.address,
    publicKey: addr.publicKey,
    type: addr.addressType === "p2tr" ? "ordinals" : "payment",
  };
}

// Sign a message with the connected wallet
export async function signMessageWithXverse(
  message: string,
  address: string
): Promise<string> {
  const response = await request("signMessage", {
    message,
    address,
  });

  if (response.status === "error") {
    throw new Error(response.error?.message || "Message signing failed");
  }

  return response.result.signature;
}

// Sign a PSBT with the connected wallet
export async function signPsbtWithXverse(
  psbtBase64: string,
  signInputs: Record<string, number[]>,
  broadcast = false
): Promise<string> {
  const response = await request("signPsbt", {
    psbt: psbtBase64,
    signInputs,
    broadcast,
  });

  if (response.status === "error") {
    throw new Error(response.error?.message || "PSBT signing failed");
  }

  return response.result.psbt;
}

// Sign PSBT for a single input (player use)
export async function signPlayerPsbt(
  psbtBase64: string,
  playerAddress: string,
  inputIndex: number
): Promise<string> {
  return signPsbtWithXverse(psbtBase64, {
    [playerAddress]: [inputIndex],
  }, false);
}

// Sign PSBT for presenter (all inputs are their own escrow)
export async function signPresenterPsbt(
  psbtBase64: string,
  presenterAddress: string
): Promise<string> {
  return signPsbtWithXverse(
    psbtBase64,
    {
      [presenterAddress]: [0],
    },
    false
  );
}

// Disconnect wallet (best-effort)
export async function disconnectXverseWallet(): Promise<void> {
  try {
    await request("wallet_disconnect", {});
  } catch {
    // Ignore disconnect errors
  }
}
