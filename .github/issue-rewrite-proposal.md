# Complete Rewrite: Real Xverse Integration, Escrow Flow, Visual PSBT Inspector

## Problem Statement

The current Entropy Roulette implementation has critical architectural flaws that prevent it from being a real Bitcoin demo:

### 1. Wallet Integration is Broken
- Uses generic `window.bitcoin` provider instead of SatsConnect protocol
- Xverse detection checks `(window as any).XverseProviders` but never uses `sats-connect`
- PSBT passed to wallet is empty string `psbtBase64=""`
- No actual signing happens — the entire wallet flow is a UI simulation

### 2. Game Flow is Incomplete (Simulation Only)
- Players never provide real UTXOs. `player.utxo` is always `undefined`
- PSBT is built with empty inputs — invalid transaction
- Circular dependency: winner = TXID % count, but TXID depends on winner's address
- `collectSignatures()` only changes phase — no actual signature collection
- Mock data hardcoded (`playerCount={5}`, `totalPot={125000}`)

### 3. PSBT Visualization is Too Basic
- Only SVG circles and lines
- No raw hex viewer, no decoded input/output tables
- No signature status per input, no fee breakdown
- No transaction metadata (version, locktime, witness data)

### 4. Presenter Has No Wallet Requirement
- Generates random Nostr keypair — no Bitcoin wallet needed
- No proof of funds, no stake, no commitment
- Anyone can "host" a game with zero Bitcoin involvement

---

## Proposed Solution: Escrow + Payout Two-Transaction Flow

This fixes the circular dependency while keeping the educational/demo value.

### Transaction 1: The Game (Collaborative PSBT)
- **Inputs:** All players' real UTXOs (each signs their own input via Xverse)
- **Output:** Single output to **presenter's escrow address** (their Xverse P2WPKH address)
- **Broadcast:** Real mainnet broadcast via mempool.space
- **Entropy source:** TXID of this transaction → `lastByte % playerCount = winner`

### Transaction 2: The Payout (Presenter Signs)
- **Input:** Escrow UTXO from Transaction 1
- **Output:** Winner's receiving address
- **Broadcast:** Presenter signs with their Xverse wallet and broadcasts
- **Trust model:** Presenter is trusted escrow (acceptable for conference/education demo)

### Why This Works
- No circular dependency (winner determined AFTER Tx 1 confirms, payout is Tx 2)
- All players perform real PSBT signing (educational value)
- Real mainnet broadcast (Transaction 1)
- Presenter proves they paid winner (Transaction 2 visible on chain)

---

## Changes Required

### Dependencies
- Add `sats-connect` package for proper Xverse/SatsConnect protocol integration

### New Files
| File | Purpose |
|------|---------|
| `lib/bitcoin/sats-connect.ts` | Xverse wrapper: `wallet_connect`, `signMessage`, `signPsbt` |
| `lib/bitcoin/utxo.ts` | UTXO discovery via mempool.space API |
| `components/game/psbt-inspector.tsx` | Visual PSBT: hex viewer + decoded tables + mini graph |
| `components/presenter/xverse-connect.tsx` | Presenter wallet connect + auth button |
| `components/player/xverse-connect.tsx` | Player wallet connect button |

### Rewritten Files
| File | Changes |
|------|---------|
| `app/presenter/page.tsx` | Xverse connect → sign message → initialize → escrow flow → payout tx |
| `app/player/page.tsx` | Xverse connect → UTXO discovery → join → sign PSBT → wait |
| `components/wallet/wallet-selector.tsx` | Replace with Xverse-first SatsConnect flow |
| `lib/bitcoin/wallet-connect.ts` | Replace with SatsConnect utilities |
| `lib/bitcoin/psbt-engine.ts` | Add escrow address support, fix fee calc, two-tx flow |
| `hooks/use-game.ts` | Fix Nostr error handling, add PSBT publishing, retry logic |

### Updated Files
| File | Changes |
|------|---------|
| `lib/nostr/client.ts` | Add PSBT publish function, relay health checks, retry logic |
| `lib/game/types.ts` | Add `escrowAddress`, `payoutTxid` fields, new Nostr event kinds |
| `lib/game/state.ts` | Add escrow helpers, UTXO validation |
| `components/presenter/control-panel.tsx` | Add "Payout Winner" button for Tx 2 |

### Preserved Files (DO NOT TOUCH)
- `app/page.tsx` — landing page
- `app/layout.tsx` — layout + metadata
- `components/ui/*` — all UI primitives
- `components/game/educational-slides.tsx` — educational content
- `components/game/live-log.tsx` — terminal log

---

## Visual PSBT Inspector Design

```
┌─────────────────────────────────────────────────────────┐
│  PSBT INSPECTOR                              [byte size]  │
├─────────────────────────────────────────────────────────┤
│  RAW HEX (collapsible, monospace, scrollable)           │
│  70736274ff0100520200000001...                          │
├─────────────────────────────────────────────────────────┤
│  INPUTS (n)                              [total: X sats]│
│  ┌────┬──────────────┬──────────┬─────────┬──────────┐│
│  │ #  │ TXID         │ vout     │ Value   │ Status   ││
│  ├────┼──────────────┼──────────┼─────────┼──────────┤│
│  │ 0  │ a1b2...f8e9  │ 1        │ 25k     │ ✅ Satoshi││
│  │ 1  │ c3d4...a0b1  │ 0        │ 50k     │ ⏳ Shadow ││
│  │ 2  │ e5f6...c2d3  │ 2        │ 25k     │ ❌ Phantom││
│  └────┴──────────────┴──────────┴─────────┴──────────┘│
├─────────────────────────────────────────────────────────┤
│  OUTPUTS (1)                                            │
│  ┌──────────────┬──────────┬──────────────────────────┐│
│  │ Address      │ Value    │ Type                     ││
│  ├──────────────┼──────────┼──────────────────────────┤│
│  │ bc1q...escrow│ 95k      │ P2WPKH (Presenter escrow)││
│  └──────────────┴──────────┴──────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  FEE: 5,000 sats (5 sat/vB × 100 vbytes)                │
│  VERSION: 2  |  LOCKTIME: 0  |  INPUT_COUNT: 3           │
├─────────────────────────────────────────────────────────┤
│  [Mini Circular Graph — below data tables]              │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Live signature status updates (✅ / ⏳ / ❌)
- Row flashes green when player signs
- Copy button for raw hex
- Fee rate + total fee calculation
- Input/output count metadata

---

## SatsConnect API Usage

### Presenter Auth
```typescript
// Connect wallet
const { result } = await request('wallet_connect', { addresses: ['payment'] });
const address = result.addresses[0].address;

// Sign game creation
const { result: signResult } = await request('signMessage', {
  message: `entropy-roulette:start:${Date.now()}:${nonce}`,
  address,
});
// signResult.signature = base64 proof
```

### Player Sign PSBT
```typescript
const { result } = await request('signPsbt', {
  psbt: psbtBase64,
  signInputs: { [playerAddress]: [inputIndex] },
  broadcast: false,  // App handles broadcast
});
// result.psbt = signed PSBT base64
```

---

## Nostr Event Schema Updates

```typescript
export const NOSTR_KINDS = {
  GAME_SESSION: 30078,
  PLAYER_JOIN: 20001,
  PSBT_FRAGMENT: 20002,      // Player's signed input
  PSBT_PUBLISH: 20005,       // NEW: Full PSBT from presenter
  GAME_STATE: 20003,
  GAME_RESULT: 20004,
  PAYOUT_TX: 20006,          // NEW: Payout transaction
} as const;
```

---

## Error Handling Requirements

| Scenario | Message |
|----------|---------|
| No UTXOs | "You need funded UTXOs to play. Send sats to your Xverse address first." |
| Insufficient balance | "Your UTXO is only X sats. You bet Y sats. Need Z more." |
| Relay failure | "Nostr relay connection failed. Retrying..." + exponential backoff |
| Broadcast failure | Show mempool.space error. Allow retry. |
| Wallet reject | "You declined the signature. The game cannot proceed without your input." |
| Sign timeout | Allow presenter to remove player after 5 minutes |

---

## Testing Checklist

- [ ] Presenter connects Xverse, gets address
- [ ] Presenter signs message to start game
- [ ] QR code displays correctly
- [ ] Player scans QR, connects Xverse
- [ ] Player's UTXOs discovered via mempool.space
- [ ] Player joins with selected UTXO
- [ ] Presenter closes lobby
- [ ] PSBT built with all inputs + escrow output
- [ ] PSBT published to Nostr
- [ ] Player fetches PSBT, signs with Xverse
- [ ] Signed fragment published to Nostr
- [ ] Presenter combines all signatures
- [ ] Tx 1 broadcast to mainnet, returns TXID
- [ ] Mempool confirmation polling works
- [ ] Winner calculated from TXID
- [ ] Payout tx (Tx 2) built, signed by presenter, broadcast
- [ ] Both TXIDs displayed on result screens

---

## Security Notes

1. **Presenter is trusted escrow** — this is a demo/education tool, not a trustless protocol. For production, use a 2-of-2 multisig or DLC.
2. **Mainnet real sats** — players risk actual funds. Clear warnings required.
3. **No private keys stored** — all signing happens in Xverse wallet. App never sees keys.
4. **Nostr events are public** — game data, PSBTs, and signatures are published to public relays. No privacy guarantees.
