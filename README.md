# Entropy Roulette

A live, on-stage demonstration of **Bitcoin block entropy** as a provably fair random
number generator. Players pool sats into a single Partially Signed Bitcoin Transaction
(PSBT), the presenter broadcasts it to the Bitcoin network, and the hash of the confirming
block deterministically selects the winner. No server-side RNG, no trusted third party —
the winner is decided by the Bitcoin blockchain itself.

This project was built with [v0](https://v0.app) and is meant to be run by a **presenter**
in front of an audience, with **players** joining from their phones.

[Continue working on v0 →](https://v0.app/chat/projects/prj_5jmDym11c6Qnlz38dX0D8GFu9Amh)

---

## How it works

1. **Presenter setup** — the presenter connects an Xverse wallet, signs a game-creation
   message, and commits a self-stake. The presenter's own UTXO becomes **input #0** of the
   transaction, so a valid PSBT can be built and broadcast even with zero players.
2. **Lobby** — the presenter displays a QR code. Players scan it, connect a wallet, and sign
   an ownership message to join.
3. **Build PSBT** — the presenter sets an optional `OP_RETURN` message and builds the PSBT,
   combining the presenter input with every player input via `/api/psbt`.
4. **Sign** — the presenter signs input #0; each player signs their own input. Signed
   fragments are published over Nostr.
5. **Finalize & Broadcast** — the presenter combines all signatures, finalizes the PSBT,
   extracts the raw transaction, and **broadcasts it to the Bitcoin network** via
   mempool.space. (See the BROADCAST button in the BUILD PSBT tab.)
6. **Confirmation** — the app polls mempool.space until the transaction confirms.
7. **Winner reveal** — the confirming block's TXID is hashed into an entropy byte that maps
   deterministically to a winning player index.
8. **Payout (Tx 2)** — the presenter signs a second transaction sending the pot to the
   winner's receiving address.

The presenter flow is self-contained: it works even if no players join, which makes it
reliable for a live demo where the priority is showing a real transaction hit the chain.

---

## Routes

| Route | Audience | Purpose |
|---|---|---|
| `/presenter` | Presenter | QR display, slides, PSBT builder, broadcast, control panel |
| `/player` | Players | Connect wallet, sign ownership, place bet, sign PSBT input |

---

## Project structure

```
app/
  presenter/page.tsx     Presenter console (QR, slides, build, broadcast)
  player/page.tsx        Player join + signing flow
  api/psbt/route.ts      PSBT actions: build | combine | finalize | broadcast | decode
components/
  game/psbt-builder.tsx  Build → sign → finalize → broadcast UI (presenter)
  game/educational-slides.tsx  Presentation deck shown to the audience
  game/psbt-inspector.tsx      Human-readable PSBT inspector
  presenter/control-panel.tsx  Phase indicator + lifecycle controls
  wallet/                Wallet connect + multi-wallet selector
lib/
  bitcoin/psbt-engine.ts   PSBT construction + winner calculation
  bitcoin/mempool-api.ts   mempool.space client (fees, height, UTXOs, status)
  bitcoin/sats-connect.ts  Xverse (sats-connect) integration
  game/                    Game state machine + types
hooks/use-game.ts          Presenter + player game state
```

---

## Supported wallets

Xverse is the primary wallet (via `sats-connect`). The player flow also guides Unisat,
Leather, Alby, Sparrow, and BlueWallet users. The PSBT format is standard `bitcoinjs-lib`
and compatible across wallets — only the signing/delivery mechanism differs per wallet.

---

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/presenter](http://localhost:3000/presenter) to run the presenter
console, and [http://localhost:3000/player](http://localhost:3000/player) (or scan the QR) to
join as a player.

> This app broadcasts **real Bitcoin transactions** through mempool.space. Use small amounts
> and double-check the network before presenting.

---

## Contact

- **Nostr:** _coming soon_
- **Telegram:** _coming soon_
- **GitHub:** _coming soon_

---

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [PSBT (BIP-174)](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki)
- [mempool.space API](https://mempool.space/docs/api)
- [v0 Documentation](https://v0.app/docs)
