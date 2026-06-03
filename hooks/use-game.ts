// React hooks for game state management

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { GameSession, Player, GamePhase } from "@/lib/game/types";
import {
  createGameSession,
  addPlayer,
  transitionPhase,
  updatePlayerSignature,
  calculateTotalPot,
  generateAnonymousName,
  generatePlayerId,
} from "@/lib/game/state";
import {
  generateKeypair,
  publishGameSession,
  publishPlayerJoin,
  publishGameState,
  publishGameResult,
  publishPsbtFragment,
  subscribeToGameSession,
  subscribeToPlayerJoins,
  subscribeToPsbtFragments,
  subscribeToGameState,
  subscribeToGameResult,
} from "@/lib/nostr/client";
import { calculateWinner } from "@/lib/bitcoin/psbt-engine";

// Hook for presenter to manage game state
export function usePresenterGame() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [keypair, setKeypair] = useState<{
    secretKey: Uint8Array;
    pubkey: string;
  } | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);

  // Initialize a new game
  const initializeGame = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const newKeypair = generateKeypair();
      setKeypair(newKeypair);

      const newSession = createGameSession(newKeypair.pubkey);

      setSession(newSession);

      // Publish initial session
      await publishGameSession(newKeypair.secretKey, newSession);

      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize");
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Open the lobby
  const openLobby = useCallback(async () => {
    if (!session || !keypair) return;

    try {
      const updated = transitionPhase(session, "LOBBY_OPEN");
      setSession(updated);
      await publishGameSession(keypair.secretKey, updated);
      await publishGameState(
        keypair.secretKey,
        updated.id,
        updated.phase,
        calculateTotalPot(updated),
        updated.players.length
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open lobby");
    }
  }, [session, keypair]);

  // Close the lobby
  const closeLobby = useCallback(async () => {
    if (!session || !keypair) return;

    try {
      const updated = transitionPhase(session, "LOBBY_CLOSED");
      setSession(updated);
      await publishGameSession(keypair.secretKey, updated);
      await publishGameState(
        keypair.secretKey,
        updated.id,
        updated.phase,
        calculateTotalPot(updated),
        updated.players.length
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close lobby");
    }
  }, [session, keypair]);

  // Start collecting signatures
  const collectSignatures = useCallback(async () => {
    if (!session || !keypair) return;

    try {
      const updated = transitionPhase(session, "COLLECTING_SIGNATURES");
      setSession(updated);
      await publishGameSession(keypair.secretKey, updated);
      await publishGameState(
        keypair.secretKey,
        updated.id,
        updated.phase,
        calculateTotalPot(updated),
        updated.players.length
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to collect signatures"
      );
    }
  }, [session, keypair]);

  // Finalize PSBT
  const finalizePsbt = useCallback(
    async (finalizedPsbt: string, txid: string) => {
      if (!session || !keypair) return;

      try {
        let updated = transitionPhase(session, "FINALIZED");
        updated = { ...updated, finalizedPsbt, txid };
        setSession(updated);
        await publishGameSession(keypair.secretKey, updated);
        await publishGameState(
          keypair.secretKey,
          updated.id,
          updated.phase,
          calculateTotalPot(updated),
          updated.players.length,
          txid
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to finalize");
      }
    },
    [session, keypair]
  );

  // Broadcast transaction
  const broadcastTx = useCallback(
    async (txid: string) => {
      if (!session || !keypair) return;

      try {
        let updated = transitionPhase(session, "BROADCAST");
        updated = { ...updated, txid };
        setSession(updated);
        await publishGameSession(keypair.secretKey, updated);
        await publishGameState(
          keypair.secretKey,
          updated.id,
          updated.phase,
          calculateTotalPot(updated),
          updated.players.length,
          txid
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to broadcast");
      }
    },
    [session, keypair]
  );

  // Confirm and calculate winner
  const confirmAndResolve = useCallback(
    async (txid: string) => {
      if (!session || !keypair) return;

      try {
        const { winnerIndex, entropyByte, calculation } = calculateWinner(
          txid,
          session.players.length
        );

        const winner = session.players[winnerIndex];

        let updated = transitionPhase(session, "CONFIRMED");
        updated = {
          ...updated,
          winnerId: winner.id,
          winnerIndex,
        };
        setSession(updated);

        await publishGameSession(keypair.secretKey, updated);
        await publishGameResult(
          keypair.secretKey,
          updated.id,
          winner.id,
          winner.pubkey,
          winner.displayName,
          calculateTotalPot(updated),
          txid,
          calculation
        );

        // Final transition
        const complete = transitionPhase(updated, "COMPLETE");
        setSession(complete);
        await publishGameSession(keypair.secretKey, complete);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve");
      }
    },
    [session, keypair]
  );

  // Handle player join event
  const handlePlayerJoin = useCallback(
    (playerId: string, pubkey: string, displayName: string, amount: number, receivingAddress: string) => {
      setSession((current) => {
        if (!current || current.phase !== "LOBBY_OPEN") return current;

        const newPlayer: Player = {
          id: playerId,
          pubkey,
          displayName,
          amount,
          receivingAddress,
          joinedAt: Date.now(),
        };

        return {
          ...current,
          players: [...current.players, newPlayer],
        };
      });
    },
    []
  );

  // Handle PSBT fragment
  const handlePsbtFragment = useCallback(
    (playerId: string, signedPsbt: string) => {
      setSession((current) => {
        if (!current) return current;
        return updatePlayerSignature(current, playerId, signedPsbt);
      });
    },
    []
  );

  // Subscribe to events when game is active
  useEffect(() => {
    if (!session || !keypair) return;

    // Subscribe to player joins
    const unsubJoins = subscribeToPlayerJoins(session.id, (event) => {
      try {
        const content = JSON.parse(event.content);
        handlePlayerJoin(
          content.playerId,
          event.pubkey,
          content.displayName,
          content.amount,
          content.receivingAddress
        );
      } catch {
        // Ignore parse errors
      }
    });

    // Subscribe to PSBT fragments
    const unsubPsbt = subscribeToPsbtFragments(session.id, (event) => {
      const playerIdTag = event.tags.find((t) => t[0] === "playerId");
      if (playerIdTag) {
        handlePsbtFragment(playerIdTag[1], event.content);
      }
    });

    unsubscribesRef.current = [unsubJoins, unsubPsbt];

    return () => {
      unsubscribesRef.current.forEach((unsub) => unsub());
      unsubscribesRef.current = [];
    };
  }, [session?.id, keypair, handlePlayerJoin, handlePsbtFragment]);

  return {
    session,
    keypair,
    isInitializing,
    error,
    initializeGame,
    openLobby,
    closeLobby,
    collectSignatures,
    finalizePsbt,
    broadcastTx,
    confirmAndResolve,
    totalPot: session ? calculateTotalPot(session) : 0,
  };
}

// Hook for player to join and participate
export function usePlayerGame(gameId: string, presenterPubkey: string) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<{
    secretKey: Uint8Array;
    pubkey: string;
  } | null>(null);
  const [phase, setPhase] = useState<GamePhase>("IDLE");
  const [isJoined, setIsJoined] = useState(false);
  const [result, setResult] = useState<{
    isWinner: boolean;
    calculation: string;
    txid: string;
    totalPot: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);

  // Initialize player keypair
  useEffect(() => {
    const kp = generateKeypair();
    setKeypair(kp);
  }, []);

  // Join the game
  const joinGame = useCallback(
    async (amount: number, receivingAddress: string, displayName?: string) => {
      if (!keypair) return;

      try {
        const id = generatePlayerId();
        const name = displayName || generateAnonymousName();

        setPlayerId(id);

        await publishPlayerJoin(
          keypair.secretKey,
          gameId,
          id,
          name,
          amount,
          receivingAddress
        );

        setIsJoined(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join");
      }
    },
    [gameId, keypair]
  );

  // Submit signed PSBT
  const submitSignature = useCallback(
    async (signedPsbt: string) => {
      if (!keypair || !playerId) return;

      try {
        await publishPsbtFragment(
          keypair.secretKey,
          gameId,
          playerId,
          signedPsbt
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit");
      }
    },
    [gameId, keypair, playerId]
  );

  // Subscribe to game events
  useEffect(() => {
    // Subscribe to session updates
    const unsubSession = subscribeToGameSession(
      gameId,
      presenterPubkey,
      (event) => {
        try {
          const content = JSON.parse(event.content);
          setPhase(content.phase);
        } catch {
          // Ignore parse errors
        }
      }
    );

    // Subscribe to state updates
    const unsubState = subscribeToGameState(gameId, (event) => {
      try {
        const content = JSON.parse(event.content);
        setPhase(content.phase);
      } catch {
        // Ignore parse errors
      }
    });

    // Subscribe to result
    const unsubResult = subscribeToGameResult(gameId, (event) => {
      try {
        const content = JSON.parse(event.content);
        const isWinner = content.winnerId === playerId;
        setResult({
          isWinner,
          calculation: content.calculation,
          txid: content.txid,
          totalPot: content.totalPot,
        });
        setPhase("COMPLETE");
      } catch {
        // Ignore parse errors
      }
    });

    unsubscribesRef.current = [unsubSession, unsubState, unsubResult];

    return () => {
      unsubscribesRef.current.forEach((unsub) => unsub());
      unsubscribesRef.current = [];
    };
  }, [gameId, presenterPubkey, playerId]);

  return {
    session,
    playerId,
    keypair,
    phase,
    isJoined,
    result,
    error,
    joinGame,
    submitSignature,
  };
}

// Hook for haptic feedback
export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  const shortPulse = useCallback(() => vibrate(50), [vibrate]);
  const doublePulse = useCallback(() => vibrate([50, 50, 50]), [vibrate]);
  const longPulse = useCallback(() => vibrate(200), [vibrate]);
  const victoryPulse = useCallback(
    () => vibrate([100, 50, 100, 50, 200]),
    [vibrate]
  );
  const defeatPulse = useCallback(() => vibrate([200, 100, 200]), [vibrate]);

  return {
    vibrate,
    shortPulse,
    doublePulse,
    longPulse,
    victoryPulse,
    defeatPulse,
  };
}
