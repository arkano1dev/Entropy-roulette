"use client";

// Wallet logo components - SVG icons for each supported wallet

export function XverseLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#EE7A30" />
      <path
        d="M11 14L16.5 20L11 26H14.5L18 22L21.5 26H25L19.5 20L25 14H21.5L18 18L14.5 14H11Z"
        fill="white"
      />
      <path
        d="M25 14L29 20L25 26H28L30.5 22.5L33 26H36L32 20L36 14H33L30.5 17.5L28 14H25Z"
        fill="white"
        fillOpacity="0.6"
      />
    </svg>
  );
}

export function BlueWalletLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#1E88E5" />
      <path
        d="M20 8C13.37 8 8 13.37 8 20C8 26.63 13.37 32 20 32C26.63 32 32 26.63 32 20C32 13.37 26.63 8 20 8ZM17 24L13 20L14.41 18.59L17 21.17L25.59 12.58L27 14L17 24Z"
        fill="white"
      />
    </svg>
  );
}

export function SparrowLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#2D2D2D" />
      <path
        d="M20 10C14.48 10 10 14.48 10 20C10 25.52 14.48 30 20 30C25.52 30 30 25.52 30 20C30 14.48 25.52 10 20 10ZM20 14C20.83 14 21.5 14.67 21.5 15.5C21.5 16.33 20.83 17 20 17C19.17 17 18.5 16.33 18.5 15.5C18.5 14.67 19.17 14 20 14ZM24 25H16V23H18V19H17V17H21V23H24V25Z"
        fill="#F7931A"
      />
    </svg>
  );
}

export function AlbyLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#FFDF6F" />
      <ellipse cx="20" cy="22" rx="10" ry="8" fill="#000" />
      <ellipse cx="20" cy="21" rx="8" ry="6" fill="#FFDF6F" />
      <circle cx="16" cy="20" r="2" fill="#000" />
      <circle cx="24" cy="20" r="2" fill="#000" />
      <ellipse cx="20" cy="13" rx="3" ry="4" fill="#000" />
      <ellipse cx="20" cy="12" rx="2" ry="3" fill="#FFDF6F" />
    </svg>
  );
}

export function LeatherLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#12100F" />
      <rect x="10" y="14" width="20" height="12" rx="2" fill="#8B4513" />
      <rect x="10" y="14" width="20" height="3" fill="#654321" />
      <rect x="24" y="18" width="4" height="6" rx="1" fill="#FFD700" />
      <line x1="10" y1="20" x2="30" y2="20" stroke="#654321" strokeWidth="0.5" />
    </svg>
  );
}

export function GenericWalletLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#374151" />
      <rect x="8" y="14" width="24" height="16" rx="2" fill="#6B7280" />
      <rect x="8" y="14" width="24" height="4" fill="#4B5563" />
      <circle cx="26" cy="24" r="3" fill="#F59E0B" />
    </svg>
  );
}

export function QRScanLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#1F2937" />
      <rect x="10" y="10" width="8" height="8" rx="1" fill="#00FF66" />
      <rect x="22" y="10" width="8" height="8" rx="1" fill="#00FF66" />
      <rect x="10" y="22" width="8" height="8" rx="1" fill="#00FF66" />
      <rect x="22" y="22" width="4" height="4" fill="#00FF66" />
      <rect x="26" y="26" width="4" height="4" fill="#00FF66" />
      <rect x="22" y="26" width="4" height="4" fill="#00FF66" fillOpacity="0.5" />
    </svg>
  );
}

// Wallet info type
export interface WalletInfo {
  id: string;
  name: string;
  description: string;
  logo: React.ComponentType<{ className?: string }>;
  type: "mobile" | "extension" | "desktop";
  deepLink?: (psbtBase64: string) => string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  chromeExtensionUrl?: string;
  isAvailable?: () => boolean;
}

// Supported wallets configuration
export const SUPPORTED_WALLETS: WalletInfo[] = [
  {
    id: "xverse",
    name: "Xverse",
    description: "Popular Bitcoin & Ordinals wallet",
    logo: XverseLogo,
    type: "mobile",
    deepLink: (psbt) => `xverse://psbt?psbt=${encodeURIComponent(psbt)}&broadcast=false`,
    appStoreUrl: "https://apps.apple.com/app/xverse-bitcoin-web3-wallet/id1552272513",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.xverse.wallet",
    chromeExtensionUrl: "https://chrome.google.com/webstore/detail/xverse-wallet/idnnbdplmphpflfnlkomgpfbpcgelopg",
    isAvailable: () => typeof window !== "undefined" && !!(window as any).XverseProviders,
  },
  {
    id: "bluewallet",
    name: "BlueWallet",
    description: "Open source Bitcoin wallet",
    logo: BlueWalletLogo,
    type: "mobile",
    deepLink: (psbt) => `bluewallet:psbt?tx=${encodeURIComponent(psbt)}`,
    appStoreUrl: "https://apps.apple.com/app/bluewallet-bitcoin-wallet/id1376878040",
    playStoreUrl: "https://play.google.com/store/apps/details?id=io.bluewallet.bluewallet",
  },
  {
    id: "sparrow",
    name: "Sparrow",
    description: "Desktop Bitcoin wallet for power users",
    logo: SparrowLogo,
    type: "desktop",
    // Sparrow uses file-based PSBT import
  },
  {
    id: "alby",
    name: "Alby",
    description: "Lightning & Bitcoin browser extension",
    logo: AlbyLogo,
    type: "extension",
    chromeExtensionUrl: "https://chrome.google.com/webstore/detail/alby/iokeahhehimjnekafflcihljlcjccdbe",
    isAvailable: () => typeof window !== "undefined" && !!(window as any).alby,
  },
  {
    id: "leather",
    name: "Leather",
    description: "Bitcoin & Stacks browser wallet",
    logo: LeatherLogo,
    type: "extension",
    chromeExtensionUrl: "https://chrome.google.com/webstore/detail/leather/ldinpeekobnhjjdofggfgjlcehhmanlj",
    isAvailable: () => typeof window !== "undefined" && !!(window as any).LeatherProvider,
  },
];

// Get wallet by ID
export function getWalletById(id: string): WalletInfo | undefined {
  return SUPPORTED_WALLETS.find((w) => w.id === id);
}

// Get available extension wallets
export function getAvailableExtensionWallets(): WalletInfo[] {
  return SUPPORTED_WALLETS.filter(
    (w) => w.type === "extension" && w.isAvailable?.()
  );
}

// Get mobile wallets
export function getMobileWallets(): WalletInfo[] {
  return SUPPORTED_WALLETS.filter((w) => w.type === "mobile");
}
