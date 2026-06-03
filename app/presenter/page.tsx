"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { PSBTInspector } from "@/components/game/psbt-inspector";
import { LiveLog, createLogEntry } from "@/components/game/live-log";
import { ControlPanel } from "@/components/presenter/control-panel";
import { EducationalSlides } from "@/components/game/educational-slides";
import { XverseConnectPresenter, type PresenterWalletState } from "@/components/presenter/xverse-connect";
import { usePresenterGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import {
  getFeeEstimates,
  getBlockHeight,
  broadcastTransaction,
  getTransactionStatus,
} from "@/lib/bitcoin/mempool-api";
import {
  finalizePsbt,
  buildEscrowPsbt,
  buildPayoutPsbt,
  calculateWinner,
} from "@/lib/bitcoin/psbt-engine";
import { signPresenterPsbt } from "@/lib/bitcoin/sats-connect";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type PresenterMode = "setup" | "educate" | "game";

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
    publishPsbtForSigning,
    totalPot,
  } = usePresenterGame();

  const { longPulse, victoryPulse } = useHaptic();

  const [mode, setMode] = useState<PresenterMode>("setup");
  const [logs, setLogs] = useState<
    Array<{
      id: string;
      timestamp: number;
      type: "info" | "success" | "warning" | "error" | "system";
      message: string;
    }
  >>([]);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [feeRate, setFeeRate] = useState<number>(10);
  const [txid, setTxid] = useState<string | null>(null);
  const [payoutTxid, setPayoutTxid] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [showEducation, setShowEducation] = useState(true);

  // Wallet state
  const [walletState, setWalletState] = useState<PresenterWalletState | undefined>(
    undefined
  );

  // PSBT state
  const [currentPsbt, setCurrentPsbt] = useState<string | null>(null);

  // Add log entry
  const addLog = useCallback(
    (
      type: "info" | "success" | "warning" | "error" | "system",
      message: string
    ) => {
      setLogs((prev) => [...prev, createLogEntry(type, message)]);
    },
    []
  );

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

  // Handle initialization (requires wallet + signature)
  const handleInitialize = async () => {
    if (!walletState?.connected) {
      addLog("error", "Connect Xverse wallet first");
      return;
    }
    if (!walletState.signature) {
      addLog("error", "Sign the game creation message first");
      return;
    }

    try {
      addLog("system", "Initializing entropy field...");
      const newSession = await initializeGame();
      // Set presenter's escrow address
      if (walletState.address) {
        // Store in session state manually (we'll augment usePresenterGame later)
      }
      addLog("success", `Game created: ${newSession.id.toUpperCase()}`);
      addLog("info", "Escrow address: presenter wallet (Tx 1)");
      addLog("info", "Payout will be Tx 2 after winner determined");
      setMode("educate");
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
    if (!session || !walletState?.address) return;

    addLog("system", "Initiating signature collection...");

    try {
      // Build escrow PSBT: all inputs → single output to presenter's address
      const escrowPsbt = buildEscrowPsbt(
        session.players,
        walletState.address,
        feeRate
      );
      setCurrentPsbt(escrowPsbt);
      addLog("info", `PSBT built with ${session.players.length} inputs → escrow`);

      // Publish PSBT to Nostr for players
      await publishPsbtForSigning(escrowPsbt);
      addLog("success", "PSBT published to Nostr for players");

      await collectSignatures();
      addLog("info", "Waiting for all players to sign their inputs...");
      longPulse();
    } catch (err) {
      addLog("error", `Failed to build PSBT: ${err}`);
    }
  };

  // Handle PSBT finalization - sign presenter's input if any, combine all signatures
  const handleFinalize = async () => {
    if (!session || session.players.length === 0 || !currentPsbt) return;

    try {
      addLog("system", "Finalizing PSBT...");

      // Collect all signed PSBTs from players
      const signedPsbts = session.players
        .map((p) => p.signedPsbt)
        .filter(Boolean) as string[];

      if (signedPsbts.length === 0) {
        addLog("error", "No player signatures found");
        return;
      }

      // Combine all signatures into the base PSBT
      // For the escrow flow, each player signs their own input.
      // We need to merge them. The base PSBT is `currentPsbt`.
      // Each player's signed fragment is a PSBT with their input signed.
      // We combine them all.
      let combined = currentPsbt;
      for (const signed of signedPsbts) {
        // Use bitcoinjs combine logic
        const { combinePsbts } = await import("@/lib/bitcoin/psbt-engine");
        combined = combinePsbts([combined, signed]);
      }

      const { rawTx, txid: finalTxid } = finalizePsbt(combined);
      setTxid(finalTxid);
      await setFinalizedPsbt(combined, finalTxid);

      addLog("success", `PSBT finalized | TXID: ${finalTxid.slice(0, 16)}...`);
      longPulse();
    } catch (err) {
      addLog("error", `Finalization failed: ${err}`);
    }
  };

  // Handle broadcast (Tx 1)
  const handleBroadcast = async () => {
    if (!session || !txid) return;

    try {
      addLog("system", "Broadcasting Tx 1 to Bitcoin network...");
      // We need rawTx to broadcast — store it somewhere. For now extract from finalizedPsbt.
      if (!session.finalizedPsbt) {
        addLog("error", "No finalized PSBT found");
        return;
      }
      const { rawTx } = finalizePsbt(session.finalizedPsbt);
      const broadcastedTxid = await broadcastTransaction(rawTx);
      addLog("success", `Tx 1 broadcast! TXID: ${broadcastedTxid.slice(0, 16)}...`);
      addLog("info", "Waiting for block confirmation...");
      setIsPolling(true);
      longPulse();
    } catch (err) {
      addLog("error", `Broadcast failed: ${err}`);
    }
  };

  // Poll for confirmation
  useEffect(() => {
    if (!isPolling || !txid || !session || !walletState?.address) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await getTransactionStatus(txid);
        if (status.confirmed) {
          setIsPolling(false);
          addLog("success", `Tx 1 CONFIRMED in block ${status.block_height}!`);

          const { winnerIndex, entropyByte, calculation } = calculateWinner(
            txid,
            session.players.length
          );

          const winner = session.players[winnerIndex];
          addLog("system", `Entropy calculation: ${calculation}`);
          addLog(
            "success",
            `WINNER: ${winner.displayName} (Index ${winnerIndex})`
          );

          await confirmAndResolve(txid);
          victoryPulse();

          // Now build and broadcast Tx 2: payout from escrow to winner
          try {
            addLog("system", "Building payout transaction (Tx 2)...");
            // We need to know the escrow UTXO from Tx 1.
            // Tx 1 has a single output to presenter address.
            // We can look it up via mempool, but for now we know:
            // - txid = txid
            // - vout = 0 (single output)
            // - value = totalPot - fee (approximate)
            const escrowValue = totalPot - calculateFee(session.players.length, feeRate);

            const payoutPsbt = buildPayoutPsbt(
              txid,
              0,
              escrowValue,
              walletState.address,
              winner.receivingAddress,
              feeRate
            );

            // Presenter signs the payout PSBT
            const signedPayout = await signPresenterPsbt(payoutPsbt, walletState.address);
            const { rawTx: payoutRawTx, txid: payoutTxidVal } = finalizePsbt(signedPayout);

            addLog("system", "Broadcasting payout (Tx 2)...");
            const actualPayoutTxid = await broadcastTransaction(payoutRawTx);
            setPayoutTxid(actualPayoutTxid);
            addLog(
              "success",
              `Payout broadcast! TXID: ${actualPayoutTxid.slice(0, 16)}...`
            );
          } catch (payoutErr) {
            addLog("error", `Payout failed: ${payoutErr}`);
          }
        }
      } catch {
        // Continue polling
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [isPolling, txid, session, addLog, confirmAndResolve, victoryPulse, walletState, totalPot, feeRate]);

  // Log player joins
  useEffect(() => {
    if (session?.players) {
      const lastPlayer = session.players[session.players.length - 1];
      if (lastPlayer && session.phase === "LOBBY_OPEN") {
        addLog(
          "info",
          `Player joined: ${lastPlayer.displayName} (${formatSats(lastPlayer.amount)})`
        );
        longPulse();
      }
    }
  }, [session?.players.length, session?.phase, addLog, longPulse]);

  // Generate join URL
  const getJoinUrl = () => {
    if (!session || !keypair) return "";
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/player?game=${session.id}&presenter=${keypair.publicKey}`;
  };

  // Setup screen
  if (mode === "setup") {
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
            <div className="p-4 bg-neon/10 border border-neon/30 rounded-lg">
              <div className="font-mono text-sm text-neon mb-2">
                HOW IT WORKS
              </div>
              <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                Players join with their Xverse wallet. All inputs are combined into
                Tx 1 (escrow to your address). The TXID entropy determines the winner.
                Tx 2 pays the winner from escrow.
              </p>
            </div>

            {/* Xverse Connect */}
            <XverseConnectPresenter
              onConnect={setWalletState}
              onDisconnect={() => setWalletState(undefined)}
              connectedState={walletState}
            />

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
                <span className="font-mono text-neon">
                  {blockHeight.toLocaleString()}
                </span>
              </div>
            )}

            <Button
              onClick={handleInitialize}
              disabled={isInitializing || !walletState?.signature}
              className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
              size="lg"
            >
              {isInitializing ? "INITIALIZING..." : "START GAME"}
            </Button>

            {error && (
              <p className="font-mono text-xs text-glitch text-center">
                {error}
              </p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // Educational + Join screen
  if (mode === "educate") {
    return (
      <div className="min-h-screen bg-background p-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="font-mono text-2xl text-neon">ENTROPY ROULETTE</h1>
            {session && (
              <span className="font-mono text-lg text-muted-foreground">
                GAME: {session.id.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setMode("game")}
              variant="outline"
              className="font-mono"
            >
              SHOW GAME VIEW
            </Button>
            <Button
              onClick={handleOpenLobby}
              disabled={session?.phase !== "IDLE"}
              className="bg-neon text-background hover:bg-neon/80 font-mono"
            >
              OPEN LOBBY
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* Left: QR Code and Join Info */}
          <div className="col-span-5 flex flex-col items-center">
            <div className="bg-card border border-border rounded-lg p-8 w-full">
              <h2 className="font-mono text-xl text-neon text-center mb-6">
                SCAN TO JOIN
              </h2>

              <div className="bg-white rounded-lg p-6 mx-auto w-fit mb-6">
                <QRCodeSVG value={getJoinUrl()} size={280} level="M" />
              </div>

              <div className="text-center space-y-4">
                <p className="font-mono text-sm text-muted-foreground">
                  Point your phone camera at this QR code
                </p>

                <div className="p-4 bg-muted/20 rounded-lg">
                  <div className="font-mono text-xs text-muted-foreground mb-1">
                    OR VISIT
                  </div>
                  <div className="font-mono text-sm text-neon break-all">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/player?game=${session?.id}`
                      : ""}
                  </div>
                </div>

                {session && (
                  <div className="p-4 bg-neon/10 border border-neon/30 rounded-lg">
                    <div className="font-mono text-3xl text-neon mb-1">
                      {session.players.length}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {session.players.length === 1 ? "PLAYER" : "PLAYERS"}{" "}
                      JOINED
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Supported wallets */}
            <div className="bg-card border border-border rounded-lg p-6 w-full mt-6">
              <h3 className="font-mono text-sm text-neon mb-4">
                REQUIRED WALLETS
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="p-3 bg-muted/20 rounded-lg text-center">
                  <div className="font-mono text-sm text-neon">Xverse</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    Browser extension required
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Educational content */}
          <div className="col-span-7">
            <Tabs defaultValue="learn" className="w-full">
              <TabsList className="w-full grid grid-cols-3 mb-6">
                <TabsTrigger value="learn" className="font-mono">
                  LEARN
                </TabsTrigger>
                <TabsTrigger value="how" className="font-mono">
                  HOW IT WORKS
                </TabsTrigger>
                <TabsTrigger value="players" className="font-mono">
                  PLAYERS
                </TabsTrigger>
              </TabsList>

              <TabsContent value="learn">
                <EducationalSlides
                  variant="presenter"
                  showControls={true}
                />
              </TabsContent>

              <TabsContent value="how">
                <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                  <div>
                    <h3 className="font-mono text-lg text-neon mb-3">
                      The Two-Transaction Flow
                    </h3>
                    <p className="font-mono text-sm text-muted-foreground leading-relaxed">
                      Tx 1: All player inputs → single output to presenter's escrow.
                      The TXID entropy determines the winner. Tx 2: Presenter pays
                      the winner from escrow. No circular dependency.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-mono text-lg text-neon mb-3">
                      The Game Flow
                    </h3>
                    <div className="space-y-3">
                      {[
                        {
                          step: 1,
                          title: "Connect Xverse",
                          desc: "Presenter connects wallet and signs game message",
                        },
                        {
                          step: 2,
                          title: "Players Join",
                          desc: "Each player scans QR, connects Xverse, selects UTXO",
                        },
                        {
                          step: 3,
                          title: "Build Escrow PSBT",
                          desc: "All inputs → single escrow output. Players sign.",
                        },
                        {
                          step: 4,
                          title: "Broadcast Tx 1",
                          desc: "Combined PSBT broadcast to mainnet",
                        },
                        {
                          step: 5,
                          title: "Winner Selected",
                          desc: "TXID entropy: last byte % player count",
                        },
                        {
                          step: 6,
                          title: "Payout (Tx 2)",
                          desc: "Presenter broadcasts payout to winner",
                        },
                      ].map((item) => (
                        <div
                          key={item.step}
                          className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-sm flex-shrink-0">
                            {item.step}
                          </div>
                          <div>
                            <div className="font-mono text-sm text-foreground">
                              {item.title}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {item.desc}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-mono text-lg text-neon mb-3">
                      Winner Selection Formula
                    </h3>
                    <div className="p-4 bg-muted/30 rounded-lg font-mono text-sm">
                      <code>
                        winner = TXID_last_byte % player_count
                      </code>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground mt-2">
                      The last byte of the transaction ID (determined by
                      Bitcoin&apos;s mining process) modulo the number of players
                      determines the winner. This is verifiable and impossible
                      to predict or manipulate.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="players">
                <div className="bg-card border border-border rounded-lg p-6">
                  <h3 className="font-mono text-lg text-neon mb-4">
                    JOINED PLAYERS
                  </h3>
                  {session?.players && session.players.length > 0 ? (
                    <div className="space-y-3">
                      {session.players.map((player, index) => (
                        <motion.div
                          key={player.pubkey}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center justify-between p-4 bg-muted/20 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-mono text-sm">
                                {player.displayName}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {player.receivingAddress
                                  ? player.receivingAddress.slice(0, 16) + "..."
                                  : player.pubkey.slice(0, 12) + "..."}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm text-memphis">
                              {formatSats(player.amount)}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {player.signedPsbt ? (
                                <span className="text-neon">SIGNED</span>
                              ) : (
                                "PENDING"
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="font-mono text-2xl text-muted-foreground mb-2">
                        WAITING FOR PLAYERS
                      </div>
                      <p className="font-mono text-sm text-muted-foreground">
                        Players should scan the QR code to join
                      </p>
                    </div>
                  )}

                  {session && session.players.length > 0 && (
                    <div className="mt-6 p-4 bg-memphis/10 border border-memphis/30 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm">TOTAL POT</span>
                        <span className="font-mono text-xl text-memphis">
                          {formatSats(totalPot)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  }

  // Main game view (PSBT Inspector focused)
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
          <Button
            onClick={() => setMode("educate")}
            variant="outline"
            size="sm"
            className="font-mono"
          >
            SHOW QR
          </Button>
          {blockHeight && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                BLOCK
              </span>
              <span className="font-mono text-sm text-neon">
                {blockHeight.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">FEE</span>
            <span className="font-mono text-sm text-neon">{feeRate} sat/vB</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">POT</span>
            <span className="font-mono text-sm text-memphis">
              {formatSats(totalPot)}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-120px)]">
        {/* Left: QR Code panel (smaller) */}
        <div className="col-span-2">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="bg-white rounded-lg p-2 mb-2">
              <QRCodeSVG value={getJoinUrl()} size={120} level="M" />
            </div>
            <div className="font-mono text-xs text-center text-muted-foreground">
              Scan to join
            </div>
            {session && (
              <div className="mt-2 text-center">
                <div className="font-mono text-lg text-neon">
                  {session.players.length}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  players
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: PSBT Inspector */}
        <div className="col-span-7 bg-background/50 border border-border rounded-lg overflow-auto">
          {session && currentPsbt && (
            <PSBTInspector
              psbtBase64={currentPsbt}
              players={session.players}
              feeRate={feeRate}
              phase={session.phase}
            />
          )}
          {!currentPsbt && session && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="font-mono text-sm text-muted-foreground mb-2">
                  PSBT will appear here after
                </div>
                <div className="font-mono text-sm text-neon">
                  "COLLECT SIGNATURES" is clicked
                </div>
              </div>
            </div>
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

          {/* TXID display */}
          <AnimatePresence>
            {txid && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-neon/10 border border-neon/30 rounded-lg"
              >
                <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">
                  Tx 1 (Escrow)
                </div>
                <div className="font-mono text-xs text-neon break-all">{txid}</div>
              </motion.div>
            )}
            {payoutTxid && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-memphis/10 border border-memphis/30 rounded-lg"
              >
                <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">
                  Tx 2 (Payout)
                </div>
                <div className="font-mono text-xs text-memphis break-all">{payoutTxid}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
