# ⚡ Puki Sync Relay

<div align="center">

**Zero-Knowledge Blind Ledger Sync Relay for Puki Music Ecosystem**

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare_Workers_%2B_D1-orange.svg)](https://workers.cloudflare.com)
[![Docker](https://img.shields.io/badge/Docker-Self--Hosted_Homelab-blue.svg)](https://hub.docker.com)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript_/_Hono-blue.svg)](https://hono.dev)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## 🌐 Ekosistem Puki Music
Puki Music hadir dalam ekosistem multi-platform mandiri yang saling terhubung:
* 🍏 **iOS Client (SwiftUI / AVPlayer)**: [Queryzy/Puki-Music-IOs](https://github.com/Queryzy/Puki-Music-IOs)
* 🤖 **Android Client (Jetpack Compose / ExoPlayer)**: [Queryzy/Puki-Music-Android](https://github.com/Queryzy/Puki-Music-Android)
* ⚡ **Blind Ledger Sync Relay (Workers & Docker)**: [Queryzy/Puki-Sync-Relay](https://github.com/Queryzy/Puki-Sync-Relay)

---

## 🔐 Filosofi & Arsitektur Keamanan
Puki Sync Relay dirancang secara ketat sebagai **Blind Ledger** (Buku Besar Buta):
1. **Zero-Knowledge Privacy**: Server hanya menerima `payload_encrypted` (ciphertext AES-256-GCM). Server dan administrator relay **mustahil mengetahui judul lagu, artis, riwayat putar, atau daftar playlist**.
2. **Proof-of-Work (PoW) Anti-Spam**: Setiap pendaftaran vault baru mewajibkan client memecahkan puzzle nonce SHA-256 (~50ms di HP). Mencegah botnet membanjiri database tanpa membutuhkan captcha pihak ketiga.
3. **HMAC-SHA256 Signature Verification**: Setiap transaksi push (`POST /api/v1/sync/push`) dan pull (`GET /api/v1/sync/pull`) wajib ditandatangani menggunakan `K_auth` dengan toleransi jendela waktu 5 menit untuk mencegah serangan replay.
4. **FIFO Circular Buffer**: Setiap vault dibatasi maksimal 500 event terakhir (event usang otomatis dibersihkan), menjaga penggunaan storage tetap ringan dan hemat.

---

## 🚀 Panduan Deployment

Puki Sync Relay mendukung dua metode deployment: **Cloudflare Workers (Gratis & Serverless)** atau **Docker (Self-Hosted Homelab)**.

### Opsi 1: Cloudflare Workers + D1 (100% Free Tier)
Sangat direkomendasikan karena berjalan di edge global Cloudflare dengan latensi super rendah dan 0 biaya operasional.

#### Prasyarat
* Node.js 18+ & npm
* Akun Cloudflare (Free)

#### Langkah Deploy
```bash
# Clone repository
git clone https://github.com/Queryzy/Puki-Sync-Relay.git
cd Puki-Sync-Relay

# Install dependensi
npm install

# Login ke akun Cloudflare
npx wrangler login

# Buat database D1
npx wrangler d1 create puki-sync-db
# Catat database_id yang dihasilkan, lalu masukkan ke file wrangler.toml

# Jalankan migrasi skema tabel ke D1
npx wrangler d1 execute puki-sync-db --file=./schema.sql --remote

# Deploy Worker ke edge
npx wrangler deploy
```
Worker Anda akan aktif di URL `https://puki-sync.<subdomain>.workers.dev` atau custom domain Anda.

---

### Opsi 2: Docker / Docker Compose (Self-Hosted)
Bagi pengguna yang ingin menjalankan relay di VPS sendiri atau server lokal (Homelab).

```bash
# Clone repository
git clone https://github.com/Queryzy/Puki-Sync-Relay.git
cd Puki-Sync-Relay

# Jalankan container via Docker Compose
docker compose up -d --build
```

Relay akan aktif pada port `8080` menggunakan SQLite lokal (`sync.db`).

#### Health Check
```bash
curl -i http://localhost:8080/api/v1/health
```
Respons yang diharapkan:
```json
{"status":"ok","time":1710000000000,"version":"1.0.0"}
```

---

## 📡 Dokumentasi Endpoint API

| Method | Endpoint | Deskripsi | Autentikasi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Health probe & service ping | Publik |
| `GET` | `/api/v1/vault/challenge` | Minta puzzle PoW untuk pendaftaran vault | Publik |
| `POST` | `/api/v1/vault/init` | Daftarkan vault ID & verifier dengan bukti PoW | PoW Nonce |
| `POST` | `/api/v1/sync/push` | Unggah batch event terenkripsi (maks 50/request) | HMAC-SHA256 |
| `GET` | `/api/v1/sync/pull` | Ambil event sinkronisasi delta sejak sequence terakhir | HMAC-SHA256 |

---

## 📄 Lisensi
Didistribusikan di bawah lisensi MIT. Lihat file `LICENSE` untuk rincian lengkap.
