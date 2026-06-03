# Entropy Roulette

A decentralized, trust-minimized Bitcoin roulette game using PSBTs (Partially Signed Bitcoin Transactions) and Nostr for coordination. Players collaborate to build a single transaction where the winner is determined by verifiable on-chain entropy.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Security Considerations](#security-considerations)

## Overview

Entropy Roulette is an educational demonstration of collaborative Bitcoin transactions. Multiple players contribute inputs to a single PSBT, and after broadcast, the transaction ID (TXID) provides verifiable randomness to select a winner who receives all funds.

### Key Features

- **Trustless Winner Selection**: Winner determined by TXID entropy (last byte % player count)
- **No Custodial Risk**: Players sign their own inputs; funds go directly to winner's wallet
- **Real-time Coordination**: Nostr relays sync game state across all participants
- **Wallet Agnostic**: Supports browser extensions (Alby, Xverse, Leather) and mobile wallets via BIP-21 QR codes
- **Presenter Mode**: Full-screen projection view for live demonstrations
- **Educational UI**: Step-by-step explanations of PSBT mechanics

## How It Works

### Game Flow

```
1. PRESENTER SETUP
   ├── Presenter initializes game session
   ├── Nostr event published with game ID
   └── QR code generated for players to join

2. PLAYER JOIN (Lobby Open)
   ├── Scan QR / open join link
   ├── Enter display name
   ├── Select bet amount (sats)
   ├── Provide receiving address from wallet
   └── Player join event published to Nostr

3. SIGNATURE COLLECTION (Lobby Closed)
   ├── Presenter builds unified PSBT
   ├── Players sign their inputs
   └── Signed PSBTs collected via Nostr

4. FINALIZATION & BROADCAST
   ├── All signatures combined
   ├── PSBT finalized
   ├── Transaction broadcast to mempool.space
   └── Wait for block confirmation

5. WINNER RESOLUTION
   ├── Block mined with transaction
   ├── Extract TXID
   ├── Calculate: lastByte(TXID) % playerCount = winnerIndex
   └── Winner receives all funds to their wallet address
```

### Winner Calculation

The winner is determined by verifiable on-chain entropy:

```typescript
// Extract last byte of TXID (hex)
const lastByte = parseInt(txid.slice(-2), 16);  // 0-255

// Winner index = lastByte mod playerCount
const winnerIndex = lastByte % playerCount;

// Example:
// TXID: abc123...def89
// Last byte: 0x89 = 137
// Players: 5
// Winner: 137 % 5 = 2 (third player, zero-indexed)
```

## Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16, React 19 | UI Framework |
| Styling | Tailwind CSS 4, Framer Motion | Design System |
| Bitcoin | bitcoinjs-lib 7.x | PSBT creation/signing |
| P2P Sync | nostr-tools 2.x | Decentralized coordination |
| Blockchain | mempool.space API | UTXO lookup, broadcast, confirmation |
| QR Codes | qrcode.react | Mobile wallet integration |

### Directory Structure

```
entropy-roulette/
├── app/                      # Next.js App Router
│   ├── page.tsx             # Landing page
│   ├── presenter/           # Presenter view
│   │   └── page.tsx
│   └── player/              # Player view  
│       └── page.tsx
├── components/
│   ├── game/                # Game-specific components
│   │   ├── educational-slides.tsx
│   │   ├── live-log.tsx
│   │   ├── psbt-graph.tsx
│   │   └── qr-join.tsx
│   ├── player/              # Player UI components
│   │   ├── result-loser.tsx
│   │   ├── result-winner.tsx
│   │   └── waiting-room.tsx
│   ├── presenter/           # Presenter UI components
│   │   └── control-panel.tsx
│   ├── wallet/              # Wallet integration
│   │   ├── wallet-logos.tsx
│   │   └── wallet-selector.tsx
│   └── ui/                  # shadcn/ui components
├── hooks/
│   └── use-game.ts          # Game state React hooks
├── lib/
│   ├── bitcoin/             # Bitcoin utilities
│   │   ├── mempool-api.ts   # Mempool.space integration
│   │   ├── psbt-engine.ts   # PSBT creation/finalization
│   │   └── wallet-connect.ts # Wallet detection/signing
│   ├── game/                # Game logic
│   │   ├── state.ts         # State management
│   │   └── types.ts         # TypeScript interfaces
│   └── nostr/               # Nostr integration
│       └── client.ts        # Relay connection/events
└── docs/                    # Documentation
```

### Data Flow

```
┌─────────────┐    Nostr Events    ┌─────────────┐
│  PRESENTER  │◄──────────────────►│   PLAYERS   │
│    VIEW     │                    │    VIEW     │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ Game State                       │ Player Actions
       ▼                                  ▼
┌─────────────────────────────────────────────────┐
│              NOSTR RELAYS                        │
│  (nos.lol, relay.damus.io, relay.nostr.band)   │
└─────────────────────────────────────────────────┘
       │                                  │
       │ Session Events                   │ Join/PSBT Events
       ▼                                  ▼
┌─────────────────────────────────────────────────┐
│              GAME STATE STORE                    │
│  (In-memory React state, synced via Nostr)      │
└─────────────────────────────────────────────────┘
       │
       │ PSBT Operations
       ▼
┌─────────────────────────────────────────────────┐
│              BITCOIN NETWORK                     │
│  (mempool.space API → Bitcoin Mainnet)          │
└─────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- pnpm (recommended) or npm
- A Bitcoin wallet for testing (Alby, Xverse, or mobile wallet)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/entropy-roulette.git
cd entropy-roulette

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Running Locally

1. Open http://localhost:3000 in your browser
2. Click "Start Presenting" to open presenter view
3. Initialize a new game
4. Open the player join link on another device/tab
5. Follow the flow to test the complete game cycle

### Testing with Real Bitcoin

**WARNING**: This application uses Bitcoin Mainnet by default. Test with small amounts only.

For testing, you can:
1. Use testnet4/signet by modifying `lib/bitcoin/psbt-engine.ts`
2. Use very small bet amounts (5000-10000 sats)
3. Test wallet signing without actually broadcasting

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Environment Variables

No environment variables are required for basic functionality. The application uses public APIs:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_MEMPOOL_API` | No | `https://mempool.space/api` | Mempool.space API endpoint |
| `NEXT_PUBLIC_NOSTR_RELAYS` | No | See `lib/game/types.ts` | Comma-separated Nostr relay URLs |

### Docker

```dockerfile
FROM node:18-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

## Configuration

### Game Settings

Edit `lib/game/types.ts` to customize:

```typescript
export const DEFAULT_CONFIG = {
  minBet: 5000,      // Minimum bet in sats (5k sats)
  maxBet: 1000000,   // Maximum bet in sats (1M sats)
  defaultBet: 25000, // Default bet suggestion (25k sats)
  presenterBet: 50000, // Sponsor contribution (50k sats)
  feeRate: 10,       // Transaction fee rate (sat/vB)
} as const;
```

### Nostr Relays

Edit `lib/game/types.ts` to add/remove relays:

```typescript
export const NOSTR_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  // Add your own relay here
] as const;
```

### Bitcoin Network

The application defaults to **Bitcoin Mainnet**. To use testnet:

```typescript
// In lib/bitcoin/psbt-engine.ts
import * as bitcoin from "bitcoinjs-lib";

// Change from:
const network = bitcoin.networks.bitcoin;

// To:
const network = bitcoin.networks.testnet;
```

Also update mempool API in `lib/bitcoin/mempool-api.ts`:

```typescript
// Change from:
const MEMPOOL_API = "https://mempool.space/api";

// To:
const MEMPOOL_API = "https://mempool.space/testnet/api";
```

## API Reference

See [API.md](./API.md) for complete API documentation.

## Security Considerations

### What This Application Does NOT Do

- **No custody of funds**: Players sign their own inputs; the application never holds private keys
- **No server-side state**: All game state is ephemeral and client-side
- **No account system**: Players are pseudonymous via Nostr keypairs

### Trust Assumptions

1. **mempool.space**: Trusted for UTXO data and transaction broadcast
2. **Nostr relays**: Trusted for message delivery (not integrity - signatures verify)
3. **Winner selection**: Verifiable by anyone with the TXID

### Potential Attack Vectors

| Vector | Mitigation | Residual Risk |
|--------|-----------|---------------|
| Relay censorship | Multiple relays used | Medium - can affect UX |
| TXID manipulation | Impossible after mining | None |
| Front-running | No mempool visibility needed | Low |
| Sybil players | Economic cost (real sats) | Low |

### Recommendations

- Use for educational purposes and small amounts
- Verify winner calculation independently
- Run your own Nostr relay for production use
- Consider adding minimum player counts

---

## License

MIT License - See LICENSE file for details.

## Contributing

See CONTRIBUTING.md for guidelines.

## Support

- GitHub Issues: [Report bugs](https://github.com/your-org/entropy-roulette/issues)
- Nostr: Follow for updates
