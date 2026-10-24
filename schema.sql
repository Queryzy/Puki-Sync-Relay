-- Schema DDL for Cloudflare D1 & SQLite (Puki Sync Relay)

CREATE TABLE IF NOT EXISTS vaults (
    vault_id TEXT PRIMARY KEY,
    auth_verifier TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

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
