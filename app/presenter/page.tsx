"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PSBTGraph } from "@/components/game/psbt-graph";
import { LiveLog, createLogEntry } from "@/components/game/live-log";
import { ControlPanel } from "@/components/presenter/control-panel";
import { QRJoin } from "@/components/game/qr-join";
import { usePresenterGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import { getFeeEstimates, getBlockHeight, broadcastTransaction, getTransactionStatus } from "@/lib/bitcoin/mempool-api";
import { finalizePsbt, buildUnifiedPsbt, calculateWinner } from "@/lib/bitcoin/psbt-engine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Simulate the presenter address - in production this would come from wallet
const DEFAULT_POT_ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

export default function PresenterPage() {
  const {
    session,
    keypair,
    isInitializing,
    error,
    initializeGame,
    openLobby,
    closeLobby,
    collectSignatures,
    finalizePsbt: setFinalizedPsbt,
    broadcastTx,
    confirmAndResolve,
    totalPot,
  } = usePresenterGame();

  const { longPulse, victoryPulse } = useHaptic();

  const [logs, setLogs] = useState<Array<{ id: string; timestamp: number; type: "info" | "success" | "warning" | "error" | "system"; message: string }>>([]);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [feeRate, setFeeRate] = useState<number>(10);
  const [potAddress, setPotAddress] = useState(DEFAULT_POT_ADDRESS);
  const [isSetup, setIsSetup] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Add log entry
  const addLog = useCallback((type: "info" | "success" | "warning" | "error" | "system", message: string) => {
    setLogs((prev) => [...prev, createLogEntry(type, message)]);
  }, []);

  // Fetch block height and fees on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [height, fees] = await Promise.all([
          getBlockHeight(),
          getFeeEstimates(),
        ]);
        setBlockHeight(height);
        setFeeRate(fees.halfHourFee);
        addLog("system", `Connected to mempool.space | Block: ${height}`);
        addLog("system", `Fee rate: ${fees.halfHourFee} sat/vB`);
      } catch (err) {
        addLog("error", "Failed to connect to mempool.space");
      }
    };
    fetchData();
  }, [addLog]);

  // Handle initialization
  const handleInitialize = async () => {
    try {
      addLog("system", "Initializing entropy field...");
      const newSession = await initializeGame(potAddress);
      addLog("success", `Game created: ${newSession.id.toUpperCase()}`);
      addLog("info", `Pot address: ${potAddress.slice(0, 20)}...`);
      setIsSetup(true);
      longPulse();
    } catch (err) {
      addLog("error", `Initialization failed: ${err}`);
    }
  };

  // Handle lobby open
  const handleOpenLobby = async () => {
    addLog("system", "Opening entropy lobby...");
    await openLobby();
    addLog("success", "Lobby is now open - players can join");
    longPulse();
  };

  // Handle lobby close
  const handleCloseLobby = async () => {
    addLog("warning", "Closing lobby - no more players can join");
    await closeLobby();
    addLog("success", `Lobby closed with ${session?.players.length} players`);
    longPulse();
  };

  // Handle signature collection
  const handleCollectSignatures = async () => {
    addLog("system", "Initiating signature collection...");
    await collectSignatures();
    addLog("info", "Waiting for all players to sign their inputs...");
    longPulse();
  };

  // Handle PSBT finalization
  const handleFinalize = async () => {
    if (!session) return;

    try {
      addLog("system", "Building unified PSBT...");

      // In a real implementation, we would use the actual signed PSBTs
      // For now, we simulate the finalization
      const unifiedPsbt = buildUnifiedPsbt(
        session.players,
        potAddress,
        feeRate
      );

      addLog("info", `PSBT has ${session.players.length} inputs`);

      // Finalize (in real implementation, this requires actual signatures)
      const { rawTx, txid: finalTxid } = finalizePsbt(unifiedPsbt);

      setTxid(finalTxid);
      await setFinalizedPsbt(unifiedPsbt, finalTxid);

      addLog("success", `PSBT finalized | TXID: ${finalTxid.slice(0, 16)}...`);
      longPulse();
    } catch (err) {
      addLog("error", `Finalization failed: ${err}`);
    }
  };

  // Handle broadcast
  const handleBroadcast = async () => {
    if (!session || !txid) return;

    try {
      addLog("system", "Broadcasting to Bitcoin network...");

      // In production, this would use the actual raw transaction
      // For demo, we simulate the broadcast
      // const broadcastTxid = await broadcastTransaction(session.rawTx!);

      await broadcastTx(txid);
      addLog("success", `Transaction broadcast! TXID: ${txid.slice(0, 16)}...`);
      addLog("info", "Waiting for block confirmation...");

      // Start polling for confirmation
      setIsPolling(true);
      longPulse();
    } catch (err) {
      addLog("error", `Broadcast failed: ${err}`);
    }
  };

  // Poll for confirmation
  useEffect(() => {
    if (!isPolling || !txid || !session) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await getTransactionStatus(txid);
        if (status.confirmed) {
          setIsPolling(false);
          addLog("success", `CONFIRMED in block ${status.block_height}!`);

          // Calculate winner
          const { winnerIndex, entropyByte, calculation } = calculateWinner(
            txid,
            session.players.length
          );

          const winner = session.players[winnerIndex];
          addLog("system", `Entropy calculation: ${calculation}`);
          addLog("success", `WINNER: ${winner.displayName} (Index ${winnerIndex})`);

          await confirmAndResolve(txid);
          victoryPulse();
        }
      } catch {
        // Continue polling
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [isPolling, txid, session, addLog, confirmAndResolve, victoryPulse]);

  // Log player joins
  useEffect(() => {
    if (session?.players) {
      const lastPlayer = session.players[session.players.length - 1];
      if (lastPlayer && session.phase === "LOBBY_OPEN") {
        addLog("info", `Player joined: ${lastPlayer.displayName} (${formatSats(lastPlayer.amount)})`);
        longPulse();
      }
    }
  }, [session?.players.length, session?.phase, addLog, longPulse]);

  // Setup screen
  if (!isSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-card border border-border rounded-lg p-8"
        >
          <h1 className="font-mono text-2xl text-neon mb-2 text-center">
            ENTROPY ROULETTE
          </h1>
          <p className="font-mono text-sm text-muted-foreground text-center mb-8">
            Presenter Configuration
          </p>

          <div className="space-y-6">
            <div>
              <label className="font-mono text-xs text-muted-foreground block mb-2">
                POT ADDRESS (Winner receives funds here)
              </label>
              <Input
                value={potAddress}
                onChange={(e) => setPotAddress(e.target.value)}
                placeholder="bc1q..."
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <span className="font-mono text-sm text-muted-foreground">
                Network Fee Rate
              </span>
              <span className="font-mono text-neon">{feeRate} sat/vB</span>
            </div>

            {blockHeight && (
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <span className="font-mono text-sm text-muted-foreground">
                  Block Height
                </span>
                <span className="font-mono text-neon">{blockHeight.toLocaleString()}</span>
              </div>
            )}

            <Button
              onClick={handleInitialize}
              disabled={isInitializing || !potAddress}
              className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
              size="lg"
            >
              {isInitializing ? "INITIALIZING..." : "INITIALIZE ENTROPY"}
            </Button>

            {error && (
              <p className="font-mono text-xs text-glitch text-center">{error}</p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // Main presenter view
  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-xl text-neon">ENTROPY ROULETTE</h1>
          {session && (
            <span className="font-mono text-sm text-muted-foreground">
              GAME: {session.id.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          {blockHeight && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">BLOCK</span>
              <span className="font-mono text-sm text-neon">{blockHeight.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">FEE</span>
            <span className="font-mono text-sm text-neon">{feeRate} sat/vB</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">POT</span>
            <span className="font-mono text-sm text-memphis">{formatSats(totalPot)}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-120px)]">
        {/* Left: QR Code panel */}
        <div className="col-span-3">
          {session && (
            <QRJoin
              gameId={session.id}
              playerCount={session.players.length}
              isOpen={session.phase === "LOBBY_OPEN"}
            />
          )}
        </div>

        {/* Center: PSBT Graph */}
        <div className="col-span-6 bg-background/50 border border-border rounded-lg overflow-hidden">
          {session && (
            <PSBTGraph
              players={session.players}
              totalPot={totalPot}
              winnerIndex={session.winnerIndex}
              phase={session.phase}
            />
          )}
        </div>

        {/* Right: Control panel and logs */}
        <div className="col-span-3 flex flex-col gap-4">
          {session && (
            <ControlPanel
              phase={session.phase}
              playerCount={session.players.length}
              signedCount={session.players.filter((p) => p.signedPsbt).length}
              onOpenLobby={handleOpenLobby}
              onCloseLobby={handleCloseLobby}
              onCollectSignatures={handleCollectSignatures}
              onFinalize={handleFinalize}
              onBroadcast={handleBroadcast}
              isLoading={isInitializing}
            />
          )}

          <div className="flex-1 min-h-0">
            <LiveLog entries={logs} />
          </div>
        </div>
      </div>
    </div>
  );
}
