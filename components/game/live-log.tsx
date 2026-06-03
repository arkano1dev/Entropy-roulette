"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

interface LogEntry {
  id: string;
  timestamp: number;
  type: "info" | "success" | "warning" | "error" | "system";
  message: string;
}

interface LiveLogProps {
  entries: LogEntry[];
  maxEntries?: number;
}

export function LiveLog({ entries, maxEntries = 50 }: LiveLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const displayEntries = entries.slice(-maxEntries);

  const getTypeColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "success":
        return "text-neon";
      case "warning":
        return "text-memphis";
      case "error":
        return "text-glitch";
      case "system":
        return "text-muted-foreground";
      default:
        return "text-foreground";
    }
  };

  const getTypePrefix = (type: LogEntry["type"]) => {
    switch (type) {
      case "success":
        return "[OK]";
      case "warning":
        return "[WARN]";
      case "error":
        return "[ERR]";
      case "system":
        return "[SYS]";
      default:
        return "[LOG]";
    }
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="h-full flex flex-col bg-background/80 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          <span className="font-mono text-sm text-neon">EVENT_LOG</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {displayEntries.length} entries
        </span>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
      >
        <AnimatePresence initial={false}>
          {displayEntries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex gap-2 mb-1"
            >
              <span className="text-muted-foreground shrink-0">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className={`shrink-0 ${getTypeColor(entry.type)}`}>
                {getTypePrefix(entry.type)}
              </span>
              <span className={getTypeColor(entry.type)}>{entry.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Cursor blink */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-neon">{">"}</span>
          <motion.span
            className="w-2 h-4 bg-neon"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper to create log entries
export function createLogEntry(
  type: LogEntry["type"],
  message: string
): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    message,
  };
}
