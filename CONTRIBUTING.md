# Contributing

Thanks for helping improve Entropy Roulette.

## Development

```bash
pnpm install
pnpm dev
```

Run checks before opening a pull request:

```bash
pnpm lint
pnpm test
pnpm build
```

Use testnet or mocked transactions while developing. Do not broadcast real funds from a development session.

## Pull requests

- Keep changes focused and explain the security or user-impact considerations.
- Add or update tests for transaction, validation, and winner-selection logic.
- Do not include secrets, wallet keys, seed phrases, or generated environment files.
- Document any change to transaction formats, external APIs, or supported wallets.
