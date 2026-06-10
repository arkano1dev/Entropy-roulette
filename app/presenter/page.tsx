"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { PSBTInspector } from "@/components/game/psbt-inspector";
import { LiveLog, createLogEntry } from "@/components/game/live-log";
import { PsbtBuilder } from "@/components/game/psbt-builder";
import { ControlPanel } from "@/components/presenter/control-panel";
import { EducationalSlides } from "@/components/game/educational-slides";
import { XverseConnectPresenter, type PresenterWalletState } from "@/components/presenter/xverse-connect";
import { usePresenterGame, useHaptic } from "@/hooks/use-game";
import { formatSats } from "@/lib/bitcoin/wallet-connect";
import {
  getFeeEstimates,
  getBlockHeight,
  getTransactionStatus,
  getSpendableUTXO,
  type SpendableUTXO,
} from "@/lib/bitcoin/mempool-api";
import {
  calculateWinner,
} from "@/lib/bitcoin/psbt-engine";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type PresenterMode = "setup" | "game";

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
    }>
  >([]);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [feeRate, setFeeRate] = useState<number>(10);
  const [txid, setTxid] = useState<string | null>(null);
  const [payoutTxid, setPayoutTxid] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Wallet state
  const [walletState, setWalletState] = useState<PresenterWalletState | undefined>(undefined);

  // PSBT state
  const [currentPsbt, setCurrentPsbt] = useState<string | null>(null);
  const [rawTxCache, setRawTxCache] = useState<string | null>(null);

  // OP_RETURN message — set in the game view before building the PSBT
  const [opReturnMessage, setOpReturnMessage] = useState("");

  // Presenter self-stake — the presenter's own UTXO is the FIRST input of the
  // transaction. This makes a PSBT possible with zero players: presenter alone
  // can build → sign → broadcast to demonstrate writing to the blockchain.
  const [presenterStake, setPresenterStake] = useState(10000);
  const [presenterStakeStr, setPresenterStakeStr] = useState("10000");
  const [presenterUtxo, setPresenterUtxo] = useState<SpendableUTXO | null>(null);
  const [isFetchingUtxo, setIsFetchingUtxo] = useState(false);

  // Add log entry
  const addLog = useCallback(
    (type: "info" | "success" | "warning" | "error" | "system", message: string) => {
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
      } catch {
        addLog("error", "Failed to connect to mempool.space");
      }
    };
    fetchData();
  }, [addLog]);

  // Handle initialization — auto-opens lobby immediately after
  const handleInitialize = async () => {
    if (!walletState?.connected) {
      addLog("error", "Connect Xverse wallet first");
      return;
    }
    if (!walletState.signature) {
      addLog("error", "Sign the game creation message first");
      return;
    }
    if (presenterStake < 546) {
      addLog("error", "Stake must be at least 546 sats (dust limit)");
      return;
    }

    try {
      // Fetch the presenter's own spendable UTXO — this becomes input #0 so a
      // valid transaction can be built and broadcast even with no players.
      setIsFetchingUtxo(true);
      addLog("system", `Fetching presenter UTXO for ${presenterStake.toLocaleString()} sats...`);
      const utxo = await getSpendableUTXO(walletState.address, presenterStake);
      setPresenterUtxo(utxo);
      addLog("success", `Presenter input locked: ${utxo.value.toLocaleString()} sats (${utxo.txid.slice(0, 12)}...#${utxo.vout})`);

      addLog("system", "Initializing entropy field...");
      const newSession = await initializeGame();
      addLog("success", `Game created: ${newSession.id.toUpperCase()}`);
      addLog("info", "Escrow address: presenter wallet (Tx 1)");
      setMode("game");
      longPulse();
      // Auto-open lobby
      addLog("system", "Opening lobby automatically...");
    } catch (err) {
      addLog("error", `Initialization failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setIsFetchingUtxo(false);
    }
  };

  // Handle lobby open
  const handleOpenLobby = async () => {
    addLog("system", "Opening entropy lobby...");
    await openLobby();
    addLog("success", "Lobby is now open — players can join");
    longPulse();
  };

  // Handle lobby close
  const handleCloseLobby = async () => {
    addLog("warning", "Closing lobby — no more players can join");
    await closeLobby();
    addLog("success", `Lobby closed with ${session?.players.length ?? 0} players`);
    longPulse();
  };

  // Handle signature collection — builds PSBT via /api/psbt
  const handleCollectSignatures = async () => {
    if (!session || !walletState?.address) return;

    addLog("system", "Building PSBT...");

    try {
      const playersWithUtxo = session.players.filter((p) => p.utxo);

      if (playersWithUtxo.length === 0) {
        addLog(
          "error",
          "No player inputs yet — players must confirm a bet (which fetches their UTXO) before you can build."
        );
        return;
      }
      // Build escrow PSBT via real API route
      const res = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "build",
          players: playersWithUtxo.map((p) => ({ utxo: p.utxo })),
          escrowAddress: walletState.address,
          feeRate,
          opReturnData: opReturnMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const escrowPsbt = data.data.psbtBase64;
      setCurrentPsbt(escrowPsbt);
      addLog("info", `PSBT built: ${data.data.inputCount} inputs → escrow`);
      if (opReturnMessage.trim()) {
        addLog("info", `OP_RETURN embedded: "${opReturnMessage.trim()}"`);
      }
      addLog("info", `Fee: ${data.data.estimatedFee.toLocaleString()} sats`);

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

  // Handle PSBT finalization
  const handleFinalize = async () => {
    if (!session || session.players.length === 0 || !currentPsbt) return;

    try {
      addLog("system", "Finalizing PSBT...");

      const signedPsbts = session.players
        .map((p) => p.signedPsbt)
        .filter(Boolean) as string[];

      if (signedPsbts.length === 0) {
        addLog("error", "No player signatures found");
        return;
      }

      const allPsbts = [currentPsbt, ...signedPsbts];
      const combineRes = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "combine", psbts: allPsbts }),
      });
      const combineData = await combineRes.json();
      if (!combineData.success) throw new Error(combineData.error);

      const finalRes = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          psbtBase64: combineData.data.psbtBase64,
        }),
      });
      const finalData = await finalRes.json();
      if (!finalData.success) throw new Error(finalData.error);

      const { rawTx, txid: finalTxid } = finalData.data;
      setTxid(finalTxid);
      await setFinalizedPsbt(finalData.data.finalizedPsbt, finalTxid);
      setRawTxCache(rawTx);

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

      if (!rawTxCache) {
        addLog("error", "No raw transaction cached — finalize first");
        return;
      }

      const res = await fetch("/api/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "broadcast", rawTx: rawTxCache }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      addLog("success", `Tx 1 broadcast! TXID: ${data.data.txid.slice(0, 16)}...`);
      addLog("info", "Waiting for block confirmation...");
      setIsPolling(true);
      setRawTxCache(null);
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

          const { winnerIndex, calculation } = calculateWinner(txid, session.players.length);
          const winner = session.players[winnerIndex];
          addLog("system", `Entropy: ${calculation}`);
          addLog("success", `WINNER: ${winner.displayName} (Index ${winnerIndex})`);

          await confirmAndResolve(txid);
          victoryPulse();

          addLog("info", `Winner: ${winner.displayName} — initiate Tx 2 payout`);
          addLog("info", `Escrow UTXO: ${txid.slice(0, 12)}...#0 → ${winner.receivingAddress?.slice(0, 12) ?? "unknown"}...`);
        }
      } catch {
        // Continue polling
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [isPolling, txid, session, addLog, confirmAndResolve, victoryPulse, walletState, feeRate, totalPot]);

  // Auto-open lobby when game view activates
  useEffect(() => {
    if (mode === "game" && session?.phase === "IDLE") {
      openLobby().then(() => {
        addLog("success", "Lobby is now open — players can join");
      }).catch(() => {
        addLog("error", "Failed to auto-open lobby");
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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

  // Generate join URL
  const getJoinUrl = () => {
    if (!session || !keypair) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/player?game=${session.id}&presenter=${keypair.pubkey}`;
  };

  // ---------------------------------------------------------------------------
  // SETUP SCREEN
  // ---------------------------------------------------------------------------
  if (mode === "setup") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-card border border-border rounded-lg p-8"
        >
          <h1 className="font-mono text-2xl text-neon mb-1 text-center">
            ENTROPY ROULETTE
          </h1>
          <p className="font-mono text-xs text-muted-foreground text-center mb-8">
            Presenter setup
          </p>

          <div className="space-y-5">
            {/* Xverse Connect */}
            <XverseConnectPresenter
              onConnect={setWalletState}
              onDisconnect={() => setWalletState(undefined)}
              connectedState={walletState}
            />

            {/* Network info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                <span className="font-mono text-xs text-muted-foreground">Fee rate</span>
                <span className="font-mono text-sm text-neon">{feeRate} sat/vB</span>
              </div>
              {blockHeight && (
                <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                  <span className="font-mono text-xs text-muted-foreground">Block</span>
                  <span className="font-mono text-sm text-neon">{blockHeight.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Presenter stake — first input of the transaction */}
            {walletState?.connected && (
              <div className="space-y-2">
                <label className="font-mono text-xs text-neon uppercase">
                  Your stake (input #0)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={presenterStakeStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setPresenterStakeStr(raw);
                    const parsed = parseInt(raw, 10);
                    setPresenterStake(isNaN(parsed) ? 0 : parsed);
                  }}
                  onBlur={() => {
                    if (!presenterStakeStr || parseInt(presenterStakeStr, 10) < 546) {
                      setPresenterStakeStr("10000");
                      setPresenterStake(10000);
                    }
                  }}
                  className="w-full px-3 py-2 bg-muted/20 border border-border rounded-lg font-mono text-sm text-neon focus:outline-none focus:border-neon"
                />
                <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                  The sats you commit from your own wallet. This single input lets
                  you build and broadcast a transaction even with no players.
                </p>
              </div>
            )}

            <Button
              onClick={handleInitialize}
              disabled={isInitializing || isFetchingUtxo || !walletState?.signature || presenterStake < 546}
              className="w-full bg-neon text-background hover:bg-neon/80 font-mono"
              size="lg"
            >
              {isFetchingUtxo
                ? "FETCHING UTXO..."
                : isInitializing
                ? "INITIALIZING..."
                : "START GAME"}
            </Button>

            {!walletState?.signature && walletState?.connected && (
              <p className="font-mono text-[10px] text-muted-foreground text-center">
                Sign the game creation message to continue
              </p>
            )}

            {error && (
              <p className="font-mono text-xs text-glitch text-center">{error}</p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // GAME VIEW — single mode after setup
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-lg text-neon">ENTROPY ROULETTE</h1>
          {session && (
            <span className="font-mono text-sm text-muted-foreground">
              {session.id.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {blockHeight && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">BLOCK</span>
              <span className="font-mono text-sm text-neon">{blockHeight.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">FEE</span>
            <span className="font-mono text-sm text-neon">{feeRate} sat/vB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">POT</span>
            <span className="font-mono text-sm text-memphis">{formatSats(totalPot)}</span>
          </div>
          {/* Phase + lobby actions inline */}
          {session?.phase === "IDLE" && (
            <Button onClick={handleOpenLobby} size="sm" className="bg-neon text-background hover:bg-neon/80 font-mono">
              OPEN LOBBY
            </Button>
          )}
          {session?.phase === "LOBBY_OPEN" && (
            <Button onClick={handleCloseLobby} size="sm" className="bg-glitch text-white hover:bg-glitch/80 font-mono">
              CLOSE LOBBY
              {session.players.length > 0 && (
                <span className="ml-2 bg-white/20 rounded px-1 text-xs">{session.players.length}</span>
              )}
            </Button>
          )}
          {session?.phase === "LOBBY_CLOSED" && (
            <Button onClick={handleCollectSignatures} size="sm" className="bg-memphis text-background hover:bg-memphis/80 font-mono">
              BUILD PSBT
            </Button>
          )}
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT COLUMN: QR + education panel */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-border overflow-y-auto">

          {/* QR block — prominent */}
          <div className="p-4 border-b border-border">
            <div className="bg-white rounded-lg p-3 mb-3">
              <QRCodeSVG value={getJoinUrl()} size={220} level="M" className="w-full h-auto" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-mono text-xs text-muted-foreground">
                Scan to join the game
              </p>
              {session && (
                <div className="p-2 bg-neon/10 border border-neon/30 rounded-lg">
                  <div className="font-mono text-3xl text-neon leading-none">
                    {session.players.length}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground mt-0.5">
                    {session.players.length === 1 ? "player" : "players"} joined
                  </div>
                </div>
              )}
              <div className="font-mono text-[10px] text-muted-foreground break-all leading-relaxed">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/player?game=${session?.id}`
                  : ""}
              </div>
            </div>
          </div>

          {/* OP_RETURN — editable until PSBT is built */}
          <div className="px-4 py-3 border-b border-border">
            <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1.5">
              OP_RETURN (on-chain)
            </div>
            {session?.phase === "LOBBY_OPEN" || session?.phase === "IDLE" || session?.phase === "LOBBY_CLOSED" ? (
              <>
                <input
                  type="text"
                  maxLength={80}
                  value={opReturnMessage}
                  onChange={(e) => setOpReturnMessage(e.target.value)}
                  placeholder="Set message before building PSBT..."
                  className="w-full px-2 py-1.5 bg-muted/20 border border-border rounded font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon"
                />
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1">
                  <span>Optional — embedded in Tx 1</span>
                  <span className={opReturnMessage.length > 80 ? "text-glitch" : ""}>{opReturnMessage.length}/80</span>
                </div>
              </>
            ) : (
              <div className="font-mono text-xs text-neon break-all leading-relaxed">
                {opReturnMessage.trim() || <span className="text-muted-foreground italic">none</span>}
              </div>
            )}
          </div>

          {/* Spacer to push supported wallets to the bottom */}
          <div className="flex-1" />

          {/* Supported wallets */}
          <div className="p-4 border-t border-border mt-auto">
            <div className="font-mono text-[10px] text-muted-foreground uppercase mb-2">
              Supported wallets
            </div>
            <div className="grid grid-cols-3 gap-1">
              {["Xverse", "Unisat", "Leather", "Alby", "Sparrow", "BlueWallet"].map((w) => (
                <div key={w} className="font-mono text-[10px] text-neon px-1.5 py-1 bg-neon/5 rounded text-center">
                  {w}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: presentation slides (prominent) + PSBT tools */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Tabs defaultValue="slides" className="flex flex-col h-full">
            <TabsList className="mx-3 mt-3 grid grid-cols-3 flex-shrink-0">
              <TabsTrigger value="slides" className="font-mono text-xs">SLIDES</TabsTrigger>
              <TabsTrigger value="build" className="font-mono text-xs">BUILD PSBT</TabsTrigger>
              <TabsTrigger value="inspect" className="font-mono text-xs">INSPECT</TabsTrigger>
            </TabsList>

            {/* Slides take center stage for the audience */}
            <TabsContent value="slides" className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto h-full flex items-center">
                <div className="w-full">
                  <EducationalSlides variant="presenter" showControls={true} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="build" className="flex-1 overflow-auto p-3">
              {session && walletState?.address ? (
                <div className="max-w-2xl mx-auto">
                  <PsbtBuilder
                    players={session.players}
                    presenterAddress={walletState.address}
                    presenterUtxo={presenterUtxo}
                    feeRate={feeRate}
                    opReturnText={opReturnMessage.trim()}
                    onPsbtBuilt={(psbt) => {
                      setCurrentPsbt(psbt);
                      addLog("info", "PSBT built — publishing to players for signing");
                    }}
                    onFinalized={(rawTx, finalTxid) => {
                      setTxid(finalTxid);
                      setRawTxCache(rawTx);
                      addLog("success", `PSBT finalized | TXID: ${finalTxid.slice(0, 16)}...`);
                      longPulse();
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-40">
                  <div className="font-mono text-sm text-muted-foreground">
                    Connect wallet and create game first
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="inspect" className="flex-1 overflow-auto">
              {session && currentPsbt ? (
                <div className="max-w-2xl mx-auto">
                  <PSBTInspector
                    psbtBase64={currentPsbt}
                    players={session.players}
                    feeRate={feeRate}
                    phase={session.phase}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-40">
                  <div className="font-mono text-sm text-muted-foreground">
                    PSBT will appear here after building
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT COLUMN: PLAYERS, control panel, logs */}
        <div className="w-72 flex-shrink-0 flex flex-col border-l border-border overflow-hidden">

          {/* Players list */}
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="players">
              <TabsList className="w-full grid grid-cols-2 m-3 w-[calc(100%-24px)]">
                <TabsTrigger value="players" className="font-mono text-xs">PLAYERS</TabsTrigger>
                <TabsTrigger value="timing" className="font-mono text-xs">TIMING</TabsTrigger>
              </TabsList>

              <TabsContent value="players" className="px-3 pb-3">
                {session?.players && session.players.length > 0 ? (
                  <div className="space-y-2">
                    {session.players.map((player, index) => (
                      <motion.div
                        key={player.pubkey}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 bg-muted/20 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-neon/20 flex items-center justify-center text-neon font-mono text-xs">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-mono text-xs">{player.displayName}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {player.receivingAddress
                                ? player.receivingAddress.slice(0, 12) + "..."
                                : player.pubkey.slice(0, 10) + "..."}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs text-memphis">{formatSats(player.amount)}</div>
                          <div className="font-mono text-[10px]">
                            {player.signedPsbt ? (
                              <span className="text-neon">SIGNED</span>
                            ) : (
                              <span className="text-muted-foreground">PENDING</span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    <div className="p-3 bg-memphis/10 border border-memphis/30 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs">TOTAL POT</span>
                        <span className="font-mono text-base text-memphis">{formatSats(totalPot)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="font-mono text-sm text-muted-foreground">Waiting for players</div>
                    <div className="font-mono text-xs text-muted-foreground mt-1">
                      {session?.phase === "IDLE" ? "Open the lobby first" : "Lobby is open"}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="timing" className="px-3 pb-3 space-y-2">
                {[
                  { phase: "Setup & intro", range: "2–5 min", note: "Connect wallet, start game, open lobby, explain the rules." },
                  { phase: "Lobby — players join", range: "5–15 min", note: "Scan QR, pick wallet, sign ownership message. More players = more time." },
                  { phase: "Build PSBT", range: "1 min", note: "Set OP_RETURN message, then build PSBT with all player inputs." },
                  { phase: "Players sign", range: "2–5 min", note: "Extension wallets: in-browser. Sparrow/BlueWallet: file download." },
                  { phase: "Finalize & broadcast Tx 1", range: "< 1 min", note: "Combine sigs, finalize, broadcast." },
                  { phase: "Confirmation", range: "10–60 min", note: "Depends on fee rate and mempool." },
                  { phase: "Payout Tx 2", range: "2–5 min", note: "Presenter signs Tx 2 → winner address." },
                ].map((row) => (
                  <div key={row.phase} className="flex gap-2 p-2 bg-muted/20 rounded">
                    <div className="w-16 flex-shrink-0 font-mono text-[10px] text-neon pt-0.5">{row.range}</div>
                    <div>
                      <div className="font-mono text-[10px] text-foreground">{row.phase}</div>
                      <div className="font-mono text-[10px] text-muted-foreground leading-relaxed">{row.note}</div>
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>

          {/* Control panel */}
          <div className="border-t border-border p-3 flex-shrink-0">
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
          </div>

          {/* Live log */}
          <div className="border-t border-border h-40 flex-shrink-0">
            <LiveLog entries={logs} />
          </div>

          {/* TXID displays */}
          <AnimatePresence>
            {txid && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-t border-border p-3 flex-shrink-0"
              >
                <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Tx 1 (Escrow)</div>
                <div className="font-mono text-xs text-neon break-all">{txid}</div>
              </motion.div>
            )}
            {payoutTxid && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-t border-border p-3 flex-shrink-0"
              >
                <div className="font-mono text-[10px] text-muted-foreground uppercase mb-1">Tx 2 (Payout)</div>
                <div className="font-mono text-xs text-memphis break-all">{payoutTxid}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
