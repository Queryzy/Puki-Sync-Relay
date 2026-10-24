# Puki Sync Relay

Zero-Knowledge, High-Resilience Blind Ledger Sync Relay for Puki Music (Cross-Device Telemetry Sync).

## Architecture & Security
- **Zero-Knowledge**: Client-side AES-256-GCM encryption. The relay server never sees plaintext history, searches, or playlists.
- **Proof-of-Work (PoW)**: Client computes an invisible ~50ms SHA-256 nonce puzzle during vault creation, completely stopping automated bot spam.
- **Dual Authentication**: Requests signed using `HMAC-SHA256` (`K_auth`), with a 5-minute replay-attack timestamp window.
- **Circular Buffer**: Max 500 events per vault (FIFO auto-prune), preventing disk bloat.

---

## Deployment Options

### Option 1: Cloudflare Workers + D1 (Serverless / 100% Free)
1. Inisialisasi Cloudflare D1 Database:
   ```bash
   npx wrangler d1 create puki-sync-db
   ```
2. Jalankan migrasi schema ke D1:
   ```bash
   npx wrangler d1 execute puki-sync-db --file=./schema.sql --remote
   ```
3. Deploy Worker:
   ```bash
   npx wrangler deploy
   ```

---

### Option 2: Docker Container (Self-Hosted Homelab)
1. Build & jalankan via Docker Compose:
   ```bash
   docker compose up -d --build
   ```
2. Health Check:
   ```bash
   curl -i http://localhost:8080/api/v1/health
   ```
