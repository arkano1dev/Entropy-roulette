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
  publishPsbtPublish,
  subscribeToGameSession,
  subscribeToPlayerJoins,
  subscribeToPsbtFragments,
  subscribeToGameState,
  subscribeToGameResult,
  subscribeToPsbtPublish,
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
  // Bumping this tears down and re-creates the relay subscriptions — a manual
  // "Resync" so a fresh subscription immediately catches the players' next
  // heartbeat if the presenter missed their original ephemeral events.
  const [resyncNonce, setResyncNonce] = useState(0);
  const resync = useCallback(() => setResyncNonce((n) => n + 1), []);

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

  // Move the game back to COLLECTING_SIGNATURES after a rebuild. Bypasses the
  // normal forward-only phase validation and clears finalized artifacts so the
  // control panel stops showing "Finalized / Broadcast" once the presenter
  // returns to the build step. No-op unless we are actually past collecting.
  const resetForRebuild = useCallback(async () => {
    if (!session || !keypair) return;
    if (session.phase !== "FINALIZED" && session.phase !== "BROADCAST") return;
    try {
      const updated: GameSession = {
        ...session,
        phase: "COLLECTING_SIGNATURES",
        finalizedPsbt: undefined,
        rawTx: undefined,
        txid: undefined,
      };
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
      setError(err instanceof Error ? err.message : "Failed to reset for rebuild");
    }
  }, [session, keypair]);

  // Finalize PSBT (Tx 1)
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

  // Broadcast transaction (Tx 1)
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
    (playerId: string, pubkey: string, displayName: string, amount: number, receivingAddress: string, utxo?: any) => {
      setSession((current) => {
        if (!current) return current;
        // No lobby gating: a player who signs the message and confirms their
        // bet is always registered. We only refuse once the game is fully
        // resolved (COMPLETE), since the transaction has already been built.
        if (current.phase === "COMPLETE") return current;

        // Deduplicate: don't add the same player twice. If they rejoin with a
        // new UTXO/amount, update the existing entry instead.
        const existingIdx = current.players.findIndex(
          (p) => p.id === playerId || p.pubkey === pubkey
        );
        if (existingIdx >= 0) {
          const updated = [...current.players];
          updated[existingIdx] = {
            ...updated[existingIdx],
            amount,
            receivingAddress,
            utxo: utxo ?? updated[existingIdx].utxo,
          };
          return { ...current, players: updated };
        }

        const newPlayer: Player = {
          id: playerId,
          pubkey,
          displayName,
          amount,
          receivingAddress,
          utxo,
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

  // Publish full PSBT for signing
  const publishPsbtForSigning = useCallback(
    async (psbtBase64: string) => {
      if (!session || !keypair) return;
      try {
        await publishPsbtPublish(keypair.secretKey, session.id, psbtBase64);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to publish PSBT");
      }
    },
    [session, keypair]
  );

  // Subscribe to events when game is active
  useEffect(() => {
    if (!session || !keypair) return;

    const unsubJoins = subscribeToPlayerJoins(session.id, (event) => {
      try {
        const content = JSON.parse(event.content);
        handlePlayerJoin(
          content.playerId,
          event.pubkey,
          content.displayName,
          content.amount,
          content.receivingAddress,
          content.utxo
        );
      } catch {
        // Ignore parse errors
      }
    });

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
  }, [session?.id, keypair, handlePlayerJoin, handlePsbtFragment, resyncNonce]);

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
    publishPsbtForSigning,
    resetForRebuild,
    resync,
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
  const [publishedPsbt, setPublishedPsbt] = useState<string | null>(null);
  const [result, setResult] = useState<{
    isWinner: boolean;
    calculation: string;
    txid: string;
    totalPot: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);
  // Last join details + signed fragment, kept so the heartbeat below can
  // re-broadcast them (PLAYER_JOIN / PSBT_FRAGMENT are ephemeral Nostr events).
  const joinInfoRef = useRef<{
    amount: number;
    receivingAddress: string;
    displayName: string;
    utxo?: any;
  } | null>(null);
  const signedPsbtRef = useRef<string | null>(null);

  // Initialize player keypair
  useEffect(() => {
    const kp = generateKeypair();
    setKeypair(kp);
  }, []);

  // Join the game
  const joinGame = useCallback(
    async (amount: number, receivingAddress: string, displayName?: string, utxo?: any) => {
      if (!keypair) return;

      try {
        const id = generatePlayerId();
        const name = displayName || generateAnonymousName();

        setPlayerId(id);
        // Remember join details so the heartbeat can re-announce this player.
        joinInfoRef.current = { amount, receivingAddress, displayName: name, utxo };

        await publishPlayerJoin(
          keypair.secretKey,
          gameId,
          id,
          name,
          amount,
          receivingAddress,
          utxo
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
        // Remember it so the heartbeat can re-broadcast the signature too.
        signedPsbtRef.current = signedPsbt;
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

  // Heartbeat: PLAYER_JOIN and PSBT_FRAGMENT are ephemeral — relays never replay
  // them, so a presenter who subscribed late or dropped a relay would never see
  // this player. Re-broadcasting the join (and the signed fragment, once signed)
  // every few seconds until the game completes makes it self-healing.
  useEffect(() => {
    if (!keypair || !playerId || !isJoined || phase === "COMPLETE") return;

    const beat = () => {
      const info = joinInfoRef.current;
      if (info) {
        publishPlayerJoin(
          keypair.secretKey,
          gameId,
          playerId,
          info.displayName,
          info.amount,
          info.receivingAddress,
          info.utxo
        ).catch(() => {});
      }
      if (signedPsbtRef.current) {
        publishPsbtFragment(
          keypair.secretKey,
          gameId,
          playerId,
          signedPsbtRef.current
        ).catch(() => {});
      }
    };

    const interval = setInterval(beat, 8000);
    return () => clearInterval(interval);
  }, [keypair, playerId, isJoined, phase, gameId]);

  // Subscribe to game events
  useEffect(() => {
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

    const unsubState = subscribeToGameState(gameId, (event) => {
      try {
        const content = JSON.parse(event.content);
        setPhase(content.phase);
      } catch {
        // Ignore parse errors
      }
    });

    const unsubPsbt = subscribeToPsbtPublish(gameId, (event) => {
      setPublishedPsbt(event.content);
    });

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

    unsubscribesRef.current = [unsubSession, unsubState, unsubPsbt, unsubResult];

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
    publishedPsbt,
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
