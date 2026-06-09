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
      {/* Sparrow bird silhouette */}
      <path
        d="M28 13C28 13 24 11 20 13C18 14 16 16 16 16L10 18L12 20L16 19C16 19 15 22 16 24C17 26 20 27 20 27C20 27 17 25 18 22C19 20 21 20 23 21C25 22 27 23 29 21C31 19 30 16 28 13Z"
        fill="#F7931A"
      />
      <circle cx="26" cy="15" r="1.5" fill="#2D2D2D" />
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
      {/* Alby bee face */}
      <ellipse cx="20" cy="23" rx="9" ry="7" fill="#000" />
      <ellipse cx="20" cy="22" rx="7" ry="5.5" fill="#FFDF6F" />
      {/* Eyes */}
      <circle cx="17" cy="21" r="2" fill="#000" />
      <circle cx="23" cy="21" r="2" fill="#000" />
      <circle cx="17.7" cy="20.3" r="0.7" fill="white" />
      <circle cx="23.7" cy="20.3" r="0.7" fill="white" />
      {/* Antennae */}
      <line x1="17" y1="17" x2="14" y2="12" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="23" y1="17" x2="26" y2="12" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="13.5" cy="11.5" r="1.5" fill="#000" />
      <circle cx="26.5" cy="11.5" r="1.5" fill="#000" />
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
      {/* Leather "L" lettermark */}
      <path
        d="M13 11H17V26H27V29H13V11Z"
        fill="white"
      />
    </svg>
  );
}

export function UnisatLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="#131415" />
      {/* Unisat U shape */}
      <path
        d="M12 11V24C12 27.87 15.13 31 19 31H21C24.87 31 28 27.87 28 24V11H24V24C24 25.66 22.66 27 21 27H19C17.34 27 16 25.66 16 24V11H12Z"
        fill="#F7931A"
      />
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
