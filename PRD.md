# PRD: Puki Sync Relay (Cloudflare Worker + D1)

## 1. Overview & Objective
- **Nama Proyek**: Puki Sync Relay (`puki-sync-relay`)
- **Tujuan**: Menyediakan backend relay serverless yang aman, ringan, multi-tenant, dan 100% gratis menggunakan Cloudflare Workers dan Cloudflare D1 (Serverless SQLite).
- **Prinsip Keamanan**: **Zero-Knowledge Blind Ledger**. Server tidak memiliki akses ke plaintext riwayat pencarian, pemutaran, atau playlist pengguna. Server hanya memvalidasi integritas request via HMAC dan menyimpan payload ciphertext AES-256-GCM.

---

## 2. Arsitektur & Skema Database (Cloudflare D1)

### 2.1. Skema D1 SQLite (`schema.sql`)
```sql
-- Tabel registrasi vault (Trust On First Use)
CREATE TABLE IF NOT EXISTS vaults (
    vault_id TEXT PRIMARY KEY,
    auth_verifier TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Tabel ledger event inkremental (Delta Log)
CREATE TABLE IF NOT EXISTS sync_events (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload_encrypted TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(vault_id) REFERENCES vaults(vault_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_seq ON sync_events(vault_id, seq);
CREATE INDEX IF NOT EXISTS idx_vault_created ON sync_events(vault_id, created_at);
```

---

## 3. Spesifikasi API & Keamanan

### 3.1. Autentikasi Request (HMAC-SHA256)
- Setiap request yang membaca/menulis event wajib menyertakan header:
  - `X-Vault-ID`: UUID string vault.
  - `X-Timestamp`: Unix epoch milliseconds UTC.
  - `X-Signature`: Hex format dari $\text{HMAC-SHA256}(\text{vault\_id} + \text{timestamp} + \text{body}, \text{K\_auth})$.
- Guard: Jika selisih $|\text{server\_time} - \text{timestamp}| > 300\,000\text{ ms}$ (5 menit), server mengembalikan HTTP `401 Unauthorized` (Cegah Replay Attack).

### 3.2. Endpoints
1. `GET /api/v1/health`: Cek kesiapan sistem & waktu server.
2. `POST /api/v1/vault/init`: Registrasi vault baru dengan parameter `{ vault_id, auth_verifier }`. Return `201 Created` atau `409 Conflict`.
3. `POST /api/v1/sync/push`: Menerima array `{ id, payload_encrypted }`. Mengalkulasi `seq = MAX(seq) + 1` secara atomik per `vault_id` dan menyimpan ke tabel `sync_events`.
4. `GET /api/v1/sync/pull?since_seq=X`: Mengembalikan list event dengan `seq > X` (maksimal 200 baris per request).
5. `Scheduled Worker (Cron: 0 0 * * *)`: Menghapus event yang berumur lebih dari 30 hari (`created_at < now - 30 days`).

---

## 4. Rincian Tiket Pengerjaan (Task Breakdown)

| Tiket | Deskripsi Pekerjaan | Kriteria Penerimaan (Acceptance Criteria) |
| :--- | :--- | :--- |
| **T-RELAY-1** | Setup environment worker, file `wrangler.toml`, dependensi TypeScript, dan inisialisasi D1 schema `schema.sql`. | `wrangler` terkonfigurasi, binding database D1 aktif, script DDL schema tereksekusi tanpa error. |
| **T-RELAY-2** | Implementasi endpoint `POST /api/v1/vault/init` dan `GET /api/v1/health`. | Health check return `200 OK`, pendaftaran vault menyimpan `auth_verifier` ke D1 dan menolak duplicate vault ID (`409 Conflict`). |
| **T-RELAY-3** | Middleware validasi HMAC-SHA256 & Timestamp Guard (anti-replay 5 menit). | Request dengan signature salah atau timestamp kedaluwarsa ditolak `401 Unauthorized`. |
| **T-RELAY-4** | Implementasi endpoint `POST /api/v1/sync/push` dengan generator nomor urut `seq` atomik per-vault. | Payload terenkripsi tersimpan dengan nomor urut berurutan tanpa race condition / duplicate sequence. |
| **T-RELAY-5** | Implementasi endpoint `GET /api/v1/sync/pull` dengan filtering `seq > since_seq` berurutan ASC. | Client menerima array delta event terurut sesuai kenaikan nomor urutan `seq`. |
| **T-RELAY-6** | Cron trigger harian untuk auto-prune data event tersimpan > 30 hari & verifikasi E2E endpoint via automated test runner. | Test runner curl berhasil menguji seluruh siklus: init vault -> push delta -> pull delta -> invalid signature rejection. |
