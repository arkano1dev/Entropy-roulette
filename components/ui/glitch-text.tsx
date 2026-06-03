"use client";

import { motion } from "framer-motion";
import { ReactNode, useState, useEffect } from "react";

interface GlitchTextProps {
  children: ReactNode;
  className?: string;
  intensity?: "low" | "medium" | "high";
  trigger?: boolean;
}

export function GlitchText({
  children,
  className = "",
  intensity = "medium",
  trigger = false,
}: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    if (trigger) {
      setIsGlitching(true);
      const timeout = setTimeout(() => setIsGlitching(false), 500);
      return () => clearTimeout(timeout);
    }
  }, [trigger]);

  const glitchDuration = {
    low: 0.1,
    medium: 0.2,
    high: 0.3,
  }[intensity];

  if (!isGlitching && !trigger) {
    return <span className={className}>{children}</span>;
  }

  return (
    <motion.span
      className={`relative inline-block ${className}`}
      animate={{
        x: [0, -2, 2, -1, 1, 0],
        textShadow: [
          "2px 0 #00FF66, -2px 0 #FF003C",
          "-2px 0 #00FF66, 2px 0 #FF003C",
          "2px 0 #00FF66, -2px 0 #FF003C",
        ],
      }}
      transition={{
        duration: glitchDuration,
        repeat: isGlitching ? 3 : 0,
        ease: "linear",
      }}
    >
      {children}
    </motion.span>
  );
}

// Auto-glitching text that randomly glitches
export function AutoGlitchText({
  children,
  className = "",
  interval = 5000,
}: {
  children: ReactNode;
  className?: string;
  interval?: number;
}) {
  const [trigger, setTrigger] = useState(false);

  useEffect(() => {
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        setTrigger(true);
        setTimeout(() => setTrigger(false), 500);
      }
    }, interval);

    return () => clearInterval(glitchInterval);
  }, [interval]);

  return (
    <GlitchText className={className} trigger={trigger}>
      {children}
    </GlitchText>
  );
}
