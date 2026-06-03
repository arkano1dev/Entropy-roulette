# Deployment Guide

Complete guide for deploying Entropy Roulette to production.

## Table of Contents

- [Quick Deploy (Vercel)](#quick-deploy-vercel)
- [Manual Deployment](#manual-deployment)
- [Docker Deployment](#docker-deployment)
- [Self-Hosted](#self-hosted)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Quick Deploy (Vercel)

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/entropy-roulette)

### Manual Vercel Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
vercel

# Deploy to production
vercel --prod
```

### Vercel Configuration

Create `vercel.json` (optional):

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "regions": ["iad1", "sfo1", "fra1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

---

## Manual Deployment

### Prerequisites

- Node.js 18.17+
- pnpm 8+
- Git

### Build Steps

```bash
# Clone repository
git clone https://github.com/your-org/entropy-roulette.git
cd entropy-roulette

# Install dependencies
pnpm install

# Build for production
pnpm build

# Start production server
pnpm start
```

### Build Output

```
.next/
├── standalone/      # Standalone server (recommended)
├── static/          # Static assets
└── server/          # Server components
```

### Running the Standalone Build

```bash
# Copy static assets
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# Run standalone server
cd .next/standalone
node server.js
```

---

## Docker Deployment

### Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Production stage
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  entropy-roulette:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Build and Run

```bash
# Build image
docker build -t entropy-roulette .

# Run container
docker run -p 3000:3000 entropy-roulette

# Or with docker-compose
docker-compose up -d
```

---

## Self-Hosted

### Nginx Configuration

```nginx
upstream entropy_roulette {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name entropy-roulette.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name entropy-roulette.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/entropy-roulette.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/entropy-roulette.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # WebSocket support (for Nostr)
    location / {
        proxy_pass http://entropy_roulette;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Systemd Service

```ini
# /etc/systemd/system/entropy-roulette.service
[Unit]
Description=Entropy Roulette
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/entropy-roulette
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=entropy-roulette
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable entropy-roulette
sudo systemctl start entropy-roulette
sudo systemctl status entropy-roulette
```

### SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d entropy-roulette.yourdomain.com

# Auto-renewal (usually automatic, but verify)
sudo certbot renew --dry-run
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `3000` | Server port |
| `NEXT_PUBLIC_APP_URL` | No | Auto-detected | Public URL for QR codes |
| `NEXT_PUBLIC_MEMPOOL_API` | No | `https://mempool.space/api` | Mempool API endpoint |
| `NEXT_PUBLIC_MEMPOOL_WS` | No | `wss://mempool.space/api/v1/ws` | Mempool WebSocket |

### Custom Nostr Relays

To use custom relays, edit `lib/game/types.ts`:

```typescript
export const NOSTR_RELAYS = [
  "wss://your-relay.com",
  "wss://backup-relay.com",
] as const;
```

Or create environment variable support:

```typescript
// lib/game/types.ts
export const NOSTR_RELAYS = process.env.NEXT_PUBLIC_NOSTR_RELAYS
  ? process.env.NEXT_PUBLIC_NOSTR_RELAYS.split(',')
  : [
      "wss://nos.lol",
      "wss://relay.damus.io",
      "wss://relay.nostr.band",
    ];
```

### Network Configuration

**Bitcoin Mainnet** (default):
```typescript
// lib/bitcoin/psbt-engine.ts
const network = bitcoin.networks.bitcoin;
```

**Bitcoin Testnet**:
```typescript
const network = bitcoin.networks.testnet;
```

**Bitcoin Signet**:
```typescript
// Note: Requires custom network definition
const network = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};
```

---

## Monitoring

### Health Check Endpoint

Create `app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
}
```

### Logging

Add logging middleware in `middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const start = Date.now();
  const response = NextResponse.next();
  
  // Log request (in production, use proper logging service)
  console.log(JSON.stringify({
    method: request.method,
    url: request.url,
    duration: Date.now() - start,
    timestamp: new Date().toISOString(),
  }));

  return response;
}
```

### Vercel Analytics

Already included in `package.json`. Enable in Vercel dashboard.

### Error Tracking (Sentry)

```bash
pnpm add @sentry/nextjs
```

```javascript
// sentry.client.config.js
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});
```

---

## Troubleshooting

### Common Issues

#### WebSocket Connection Failed

**Symptom**: Nostr events not syncing between presenter and players.

**Solutions**:
1. Check if relays are reachable: `wscat -c wss://nos.lol`
2. Ensure firewall allows outbound WebSocket connections
3. Check for CORS issues in browser console
4. Try alternative relays

#### PSBT Signing Fails

**Symptom**: Wallet extension throws error during signing.

**Solutions**:
1. Ensure wallet has sufficient balance for bet + fees
2. Check if UTXO is confirmed (unconfirmed UTXOs may not work)
3. Verify address format matches network (bc1 for mainnet, tb1 for testnet)
4. Check browser console for specific error

#### Transaction Broadcast Fails

**Symptom**: "Broadcast failed" error after finalization.

**Solutions**:
1. Check mempool.space for rate limiting
2. Verify transaction hex is valid
3. Check for dust outputs (< 546 sats)
4. Ensure fee rate is sufficient

#### Mobile Wallet Not Scanning QR

**Symptom**: Mobile wallet doesn't recognize QR code.

**Solutions**:
1. Verify BIP-21 URI format is correct
2. Check if wallet supports PSBT URIs (not all do)
3. Try reducing QR code error correction level
4. Test with different wallets (BlueWallet, Sparrow)

### Debug Mode

Enable debug logging:

```typescript
// Add to lib/nostr/client.ts
const DEBUG = process.env.NODE_ENV === 'development';

function log(...args: unknown[]) {
  if (DEBUG) console.log('[Nostr]', ...args);
}
```

### Performance Issues

1. **Slow initial load**: Enable Next.js static optimization
2. **Memory leaks**: Ensure Nostr subscriptions are cleaned up
3. **High CPU**: Check for excessive re-renders in React DevTools

### Security Audit Checklist

- [ ] No private keys logged or exposed
- [ ] CSP headers configured
- [ ] HTTPS enforced
- [ ] Rate limiting on API routes
- [ ] Input validation on all user data
- [ ] XSS prevention (React handles most)
- [ ] Nostr event signatures verified
