"use client";

import { useEffect, useState } from "react";

interface CRTOverlayProps {
  opacity?: number;
  enabled?: boolean;
}

export function CRTOverlay({ opacity = 0.3, enabled = true }: CRTOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !enabled) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999]"
      style={{
        background: `repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.1) 0px,
          rgba(0, 0, 0, 0.1) 1px,
          transparent 1px,
          transparent 2px
        )`,
        opacity,
      }}
      aria-hidden="true"
    />
  );
}
