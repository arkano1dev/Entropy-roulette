# API Reference

Complete API documentation for Entropy Roulette modules.

## Table of Contents

- [Bitcoin Module](#bitcoin-module)
  - [PSBT Engine](#psbt-engine)
  - [Mempool API](#mempool-api)
  - [Wallet Connect](#wallet-connect)
- [Game Module](#game-module)
  - [Types](#types)
  - [State Management](#state-management)
- [Nostr Module](#nostr-module)
  - [Client](#nostr-client)
- [React Hooks](#react-hooks)

---

## Bitcoin Module

### PSBT Engine

`lib/bitcoin/psbt-engine.ts`

Core PSBT operations using bitcoinjs-lib.

#### `createBasePsbt(winnerAddress: string): string`

Creates a new PSBT with a single output to the winner's address.

```typescript
import { createBasePsbt } from '@/lib/bitcoin/psbt-engine';

const psbt = createBasePsbt('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
// Returns: base64-encoded PSBT
```

#### `addInputToPsbt(psbtBase64: string, utxo: UTXO, inputScript: Buffer): string`

Adds an input to an existing PSBT.

```typescript
import { addInputToPsbt } from '@/lib/bitcoin/psbt-engine';

const utxo = {
  txid: 'abc123...',
  vout: 0,
  value: 50000,
  scriptPubKey: '0014...'
};

const updatedPsbt = addInputToPsbt(basePsbt, utxo, scriptBuffer);
```

#### `combinePsbts(psbtBase64Array: string[]): string`

Combines multiple signed PSBTs into one.

```typescript
import { combinePsbts } from '@/lib/bitcoin/psbt-engine';

const combined = combinePsbts([signedPsbt1, signedPsbt2, signedPsbt3]);
```

#### `finalizePsbt(psbtBase64: string): { finalizedPsbt: string; rawTx: string; txid: string }`

Finalizes all inputs and extracts the raw transaction.

```typescript
import { finalizePsbt } from '@/lib/bitcoin/psbt-engine';

const { rawTx, txid } = finalizePsbt(combinedPsbt);
// rawTx: hex-encoded transaction ready for broadcast
// txid: transaction ID
```

#### `calculateWinner(txid: string, playerCount: number): { winnerIndex: number; entropyByte: number; calculation: string }`

Calculates the winner based on TXID entropy.

```typescript
import { calculateWinner } from '@/lib/bitcoin/psbt-engine';

const { winnerIndex, entropyByte, calculation } = calculateWinner(
  'abc123...def89',
  5
);
// winnerIndex: 2
// entropyByte: 137
// calculation: "0x89 (137) % 5 = 2"
```

#### `buildUnifiedPsbt(players: Player[], winnerAddress: string, feeRate: number): string`

Builds a complete PSBT from all player inputs.

```typescript
import { buildUnifiedPsbt } from '@/lib/bitcoin/psbt-engine';

const psbt = buildUnifiedPsbt(session.players, winnerAddress, 10);
```

#### `estimateTxSize(inputCount: number): number`

Estimates transaction virtual size in vbytes.

```typescript
import { estimateTxSize } from '@/lib/bitcoin/psbt-engine';

const vsize = estimateTxSize(5); // 5 inputs
// Returns: ~361 vbytes
```

#### `calculateFee(inputCount: number, feeRate: number): number`

Calculates required fee in satoshis.

```typescript
import { calculateFee } from '@/lib/bitcoin/psbt-engine';

const fee = calculateFee(5, 10); // 5 inputs, 10 sat/vB
// Returns: ~3610 sats
```

---

### Mempool API

`lib/bitcoin/mempool-api.ts`

Integration with mempool.space API.

#### `getAddressUTXOs(address: string): Promise<MempoolUTXO[]>`

Fetches UTXOs for a Bitcoin address.

```typescript
import { getAddressUTXOs } from '@/lib/bitcoin/mempool-api';

const utxos = await getAddressUTXOs('bc1q...');
// Returns: [{ txid, vout, value, status: { confirmed, block_height } }]
```

#### `getFeeEstimates(): Promise<FeeEstimates>`

Gets recommended fee rates.

```typescript
import { getFeeEstimates } from '@/lib/bitcoin/mempool-api';

const fees = await getFeeEstimates();
// Returns: { fastestFee: 15, halfHourFee: 10, hourFee: 5, ... }
```

#### `broadcastTransaction(txHex: string): Promise<string>`

Broadcasts a raw transaction.

```typescript
import { broadcastTransaction } from '@/lib/bitcoin/mempool-api';

const txid = await broadcastTransaction(rawTxHex);
```

#### `getTransactionStatus(txid: string): Promise<TransactionStatus>`

Gets transaction confirmation status.

```typescript
import { getTransactionStatus } from '@/lib/bitcoin/mempool-api';

const status = await getTransactionStatus(txid);
// Returns: { confirmed: true, block_height: 800000, ... }
```

#### `MempoolWebSocket`

WebSocket client for real-time updates.

```typescript
import { MempoolWebSocket } from '@/lib/bitcoin/mempool-api';

const ws = new MempoolWebSocket();
await ws.connect();

ws.on('block', (block) => {
  console.log('New block:', block);
});

ws.trackTransaction(txid);
ws.trackBlocks();

// Later:
ws.disconnect();
```

---

### Wallet Connect

`lib/bitcoin/wallet-connect.ts`

Browser extension and mobile wallet utilities.

#### `hasWalletExtension(): boolean`

Checks if a Bitcoin wallet extension is available.

```typescript
import { hasWalletExtension } from '@/lib/bitcoin/wallet-connect';

if (hasWalletExtension()) {
  // Alby, Xverse, or Leather detected
}
```

#### `signPsbtWithExtension(psbtBase64: string, options?: SignPsbtOptions): Promise<string>`

Signs a PSBT using the browser extension.

```typescript
import { signPsbtWithExtension } from '@/lib/bitcoin/wallet-connect';

const signedPsbt = await signPsbtWithExtension(basePsbt);
```

#### `detectWalletType(): WalletType`

Detects the specific wallet extension type.

```typescript
import { detectWalletType } from '@/lib/bitcoin/wallet-connect';

const type = detectWalletType();
// Returns: 'alby' | 'xverse' | 'leather' | 'unknown' | 'none'
```

#### `generateBip21PaymentUri(address, amount?, label?, message?): string`

Generates a BIP-21 URI for mobile wallets.

```typescript
import { generateBip21PaymentUri } from '@/lib/bitcoin/wallet-connect';

const uri = generateBip21PaymentUri('bc1q...', 50000, 'Entropy Roulette');
// Returns: "bitcoin:bc1q...?amount=0.00050000&label=Entropy%20Roulette"
```

#### `formatSats(sats: number): string`

Formats satoshis for display.

```typescript
import { formatSats } from '@/lib/bitcoin/wallet-connect';

formatSats(50000);    // "50.0k sats"
formatSats(1500000);  // "1.50M sats"
formatSats(100000000); // "1.00000000 BTC"
```

---

## Game Module

### Types

`lib/game/types.ts`

TypeScript interfaces and constants.

#### `GamePhase`

```typescript
type GamePhase =
  | "IDLE"                  // Initial state
  | "LOBBY_OPEN"            // Accepting players
  | "LOBBY_CLOSED"          // No more joins
  | "COLLECTING_SIGNATURES" // Waiting for PSBTs
  | "FINALIZED"             // PSBT complete
  | "BROADCAST"             // TX in mempool
  | "CONFIRMED"             // Block mined
  | "COMPLETE";             // Game finished
```

#### `Player`

```typescript
interface Player {
  id: string;              // Unique player ID
  pubkey: string;          // Nostr public key
  displayName: string;     // Display name
  amount: number;          // Bet in sats
  receivingAddress: string; // Winner payout address
  utxo?: UTXO;             // Player's input UTXO
  signedPsbt?: string;     // Signed PSBT fragment
  joinedAt: number;        // Timestamp
  signedAt?: number;       // Signature timestamp
}
```

#### `GameSession`

```typescript
interface GameSession {
  id: string;              // 8-char game ID
  phase: GamePhase;        // Current phase
  presenterPubkey: string; // Presenter's Nostr pubkey
  players: Player[];       // Joined players
  basePsbt?: string;       // Initial PSBT
  combinedPsbt?: string;   // After combining
  finalizedPsbt?: string;  // Ready for broadcast
  rawTx?: string;          // Final TX hex
  txid?: string;           // Transaction ID
  winnerId?: string;       // Winner player ID
  winnerIndex?: number;    // Winner array index
  feeRate: number;         // sat/vB
  minBet: number;          // Minimum bet
  maxBet: number;          // Maximum bet
  createdAt: number;       // Creation timestamp
  closedAt?: number;       // Lobby close timestamp
  broadcastAt?: number;    // Broadcast timestamp
  confirmedAt?: number;    // Confirmation timestamp
}
```

#### `NOSTR_KINDS`

Custom Nostr event kinds:

```typescript
const NOSTR_KINDS = {
  GAME_SESSION: 30078,   // Parameterized replaceable
  PLAYER_JOIN: 20001,    // Ephemeral
  PSBT_FRAGMENT: 20002,  // Ephemeral
  GAME_STATE: 20003,     // Ephemeral
  GAME_RESULT: 20004,    // Ephemeral
} as const;
```

#### `DEFAULT_CONFIG`

```typescript
const DEFAULT_CONFIG = {
  minBet: 5000,       // 5k sats
  maxBet: 1000000,    // 1M sats
  defaultBet: 25000,  // 25k sats
  presenterBet: 50000, // 50k sats
  feeRate: 10,        // sat/vB
} as const;
```

---

### State Management

`lib/game/state.ts`

Pure functions for game state manipulation.

#### `createGameSession(presenterPubkey: string): GameSession`

Creates a new game session.

```typescript
import { createGameSession } from '@/lib/game/state';

const session = createGameSession('npub1...');
```

#### `addPlayer(session, pubkey, displayName, amount, receivingAddress): GameSession`

Adds a player to the session.

```typescript
import { addPlayer } from '@/lib/game/state';

const updated = addPlayer(session, 'npub...', 'SatoshiHodler', 50000, 'bc1q...');
```

#### `transitionPhase(session: GameSession, newPhase: GamePhase): GameSession`

Transitions game to a new phase.

```typescript
import { transitionPhase } from '@/lib/game/state';

const updated = transitionPhase(session, 'LOBBY_OPEN');
```

Valid transitions:
- IDLE → LOBBY_OPEN
- LOBBY_OPEN → LOBBY_CLOSED
- LOBBY_CLOSED → COLLECTING_SIGNATURES
- COLLECTING_SIGNATURES → FINALIZED
- FINALIZED → BROADCAST
- BROADCAST → CONFIRMED
- CONFIRMED → COMPLETE

#### `calculateTotalPot(session: GameSession): number`

Calculates total pot in sats.

```typescript
import { calculateTotalPot } from '@/lib/game/state';

const pot = calculateTotalPot(session); // Sum of all player amounts
```

#### `getWinner(session: GameSession): Player | undefined`

Gets the winning player.

```typescript
import { getWinner } from '@/lib/game/state';

const winner = getWinner(session);
```

#### `getWinnerAddress(session: GameSession): string | undefined`

Gets the winner's receiving address.

```typescript
import { getWinnerAddress } from '@/lib/game/state';

const address = getWinnerAddress(session);
```

---

## Nostr Module

### Nostr Client

`lib/nostr/client.ts`

Nostr relay communication using nostr-tools.

#### `generateKeypair(): { secretKey: Uint8Array; pubkey: string }`

Generates a new Nostr keypair.

```typescript
import { generateKeypair } from '@/lib/nostr/client';

const { secretKey, pubkey } = generateKeypair();
```

#### `publishGameSession(secretKey, session): Promise<void>`

Publishes game session to relays.

```typescript
import { publishGameSession } from '@/lib/nostr/client';

await publishGameSession(secretKey, session);
```

#### `publishPlayerJoin(secretKey, gameId, playerId, displayName, amount, receivingAddress): Promise<void>`

Publishes player join event.

```typescript
import { publishPlayerJoin } from '@/lib/nostr/client';

await publishPlayerJoin(secretKey, gameId, playerId, 'Player1', 50000, 'bc1q...');
```

#### `publishPsbtFragment(secretKey, gameId, playerId, signedPsbt): Promise<void>`

Publishes signed PSBT fragment.

```typescript
import { publishPsbtFragment } from '@/lib/nostr/client';

await publishPsbtFragment(secretKey, gameId, playerId, signedPsbtBase64);
```

#### `publishGameResult(secretKey, gameId, winnerId, winnerPubkey, winnerName, totalPot, txid, calculation): Promise<void>`

Publishes game result.

```typescript
import { publishGameResult } from '@/lib/nostr/client';

await publishGameResult(
  secretKey,
  gameId,
  winner.id,
  winner.pubkey,
  winner.displayName,
  totalPot,
  txid,
  '0x89 (137) % 5 = 2'
);
```

#### Subscription Functions

```typescript
// Subscribe to game session updates
subscribeToGameSession(gameId, presenterPubkey, onEvent): () => void

// Subscribe to player joins
subscribeToPlayerJoins(gameId, onEvent): () => void

// Subscribe to PSBT fragments
subscribeToPsbtFragments(gameId, onEvent): () => void

// Subscribe to game state changes
subscribeToGameState(gameId, onEvent): () => void

// Subscribe to game result
subscribeToGameResult(gameId, onEvent): () => void
```

All subscription functions return an unsubscribe function:

```typescript
const unsub = subscribeToPlayerJoins(gameId, (event) => {
  console.log('Player joined:', event);
});

// Later:
unsub();
```

---

## React Hooks

`hooks/use-game.ts`

React hooks for game state management.

### `usePresenterGame()`

Hook for presenter to manage game state.

```typescript
import { usePresenterGame } from '@/hooks/use-game';

function PresenterView() {
  const {
    session,           // Current game session
    keypair,           // Presenter's keypair
    isInitializing,    // Loading state
    error,             // Error message
    totalPot,          // Total pot in sats
    initializeGame,    // () => Promise<GameSession>
    openLobby,         // () => Promise<void>
    closeLobby,        // () => Promise<void>
    collectSignatures, // () => Promise<void>
    finalizePsbt,      // (psbt, txid) => Promise<void>
    broadcastTx,       // (txid) => Promise<void>
    confirmAndResolve, // (txid) => Promise<void>
  } = usePresenterGame();

  // Use in component...
}
```

### `usePlayerGame(gameId, presenterPubkey)`

Hook for player to join and participate.

```typescript
import { usePlayerGame } from '@/hooks/use-game';

function PlayerView({ gameId, presenterPubkey }) {
  const {
    session,         // Current game session
    playerId,        // This player's ID
    keypair,         // Player's keypair
    phase,           // Current game phase
    isJoined,        // Whether player has joined
    result,          // Game result (if complete)
    error,           // Error message
    joinGame,        // (amount, receivingAddress, displayName?) => Promise<void>
    submitSignature, // (signedPsbt) => Promise<void>
  } = usePlayerGame(gameId, presenterPubkey);

  // Use in component...
}
```

### `useHaptic()`

Hook for mobile haptic feedback.

```typescript
import { useHaptic } from '@/hooks/use-game';

function MobileComponent() {
  const {
    shortPulse,    // () => void - 50ms vibration
    doublePulse,   // () => void - 50-50-50ms pattern
    longPulse,     // () => void - 200ms vibration
    victoryPulse,  // () => void - celebration pattern
    defeatPulse,   // () => void - defeat pattern
    vibrate,       // (pattern) => void - custom pattern
  } = useHaptic();

  return (
    <button onClick={shortPulse}>
      Tap Me
    </button>
  );
}
```

---

## Nostr Event Schemas

### Game Session Event (kind: 30078)

```json
{
  "kind": 30078,
  "tags": [
    ["d", "game_id"],
    ["name", "Entropy Roulette"],
    ["status", "LOBBY_OPEN"],
    ["pot", "150000"],
    ["players", "3"]
  ],
  "content": "{\"phase\":\"LOBBY_OPEN\",\"players\":[...],\"feeRate\":10}"
}
```

### Player Join Event (kind: 20001)

```json
{
  "kind": 20001,
  "tags": [
    ["e", "game_id"],
    ["p", "player_pubkey"],
    ["playerId", "player_123"],
    ["amount", "50000"],
    ["address", "bc1q..."]
  ],
  "content": "{\"playerId\":\"player_123\",\"displayName\":\"SatoshiHodler\",\"amount\":50000,\"receivingAddress\":\"bc1q...\"}"
}
```

### PSBT Fragment Event (kind: 20002)

```json
{
  "kind": 20002,
  "tags": [
    ["e", "game_id"],
    ["p", "player_pubkey"],
    ["playerId", "player_123"]
  ],
  "content": "cHNidP8BAH..."
}
```

### Game Result Event (kind: 20004)

```json
{
  "kind": 20004,
  "tags": [
    ["e", "game_id"],
    ["p", "winner_pubkey"],
    ["winner", "player_123"],
    ["pot", "150000"],
    ["txid", "abc123..."]
  ],
  "content": "{\"winnerId\":\"player_123\",\"winnerPubkey\":\"npub...\",\"winnerName\":\"SatoshiHodler\",\"totalPot\":150000,\"txid\":\"abc123...\",\"calculation\":\"0x89 (137) % 3 = 2\"}"
}
```
