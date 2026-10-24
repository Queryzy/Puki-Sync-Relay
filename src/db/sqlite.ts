import { DatabaseSync } from 'node:sqlite';
import { IDatabase } from './interface.js';
import { VaultRecord, SyncEventRecord, PushEventItem } from '../types.js';

export class SqliteDatabase implements IDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
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
    `);
  }

  async initVault(vaultId: string, authVerifier: string, createdAt: number): Promise<{ success: boolean; conflict?: boolean }> {
    const existing = this.db.prepare('SELECT vault_id FROM vaults WHERE vault_id = ?').get(vaultId);
    if (existing) {
      return { success: false, conflict: true };
    }

    const insert = this.db.prepare('INSERT INTO vaults (vault_id, auth_verifier, created_at) VALUES (?, ?, ?)');
    insert.run(vaultId, authVerifier, createdAt);
    return { success: true };
  }

  async getVault(vaultId: string): Promise<VaultRecord | null> {
    const row = this.db.prepare('SELECT vault_id, auth_verifier, created_at FROM vaults WHERE vault_id = ?').get(vaultId) as any;
    if (!row) return null;
    return {
      vault_id: String(row.vault_id),
      auth_verifier: String(row.auth_verifier),
      created_at: Number(row.created_at)
    };
  }

  async pushEvents(vaultId: string, events: PushEventItem[], createdAt: number): Promise<{ syncedCount: number; latestSeq: number }> {
    if (events.length === 0) {
      const row = this.db.prepare('SELECT MAX(seq) as max_seq FROM sync_events WHERE vault_id = ?').get(vaultId) as any;
      return { syncedCount: 0, latestSeq: Number(row?.max_seq ?? 0) };
    }

    // Get current max seq
    const row = this.db.prepare('SELECT MAX(seq) as max_seq FROM sync_events WHERE vault_id = ?').get(vaultId) as any;
    let currentSeq = Number(row?.max_seq ?? 0);

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO sync_events (id, vault_id, seq, payload_encrypted, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    for (const evt of events) {
      currentSeq += 1;
      const res = insertStmt.run(evt.id, vaultId, currentSeq, evt.payload_encrypted, createdAt);
      if (Number(res.changes) > 0) {
        inserted += 1;
      }
    }

    // Circular buffer: keep max 500 latest events per vault
    this.db.prepare(`
      DELETE FROM sync_events
      WHERE vault_id = ? AND seq <= (
        SELECT seq FROM sync_events WHERE vault_id = ? ORDER BY seq DESC LIMIT 1 OFFSET 500
      )
    `).run(vaultId, vaultId);

    return { syncedCount: inserted, latestSeq: currentSeq };
  }

  async pullEvents(vaultId: string, sinceSeq: number, limit: number = 200): Promise<{ latest_seq: number; events: SyncEventRecord[] }> {
    const rows = this.db.prepare(`
      SELECT id, vault_id, seq, payload_encrypted, created_at
      FROM sync_events
      WHERE vault_id = ? AND seq > ?
      ORDER BY seq ASC
      LIMIT ?
    `).all(vaultId, sinceSeq, limit) as any[];

    const maxRow = this.db.prepare('SELECT MAX(seq) as max_seq FROM sync_events WHERE vault_id = ?').get(vaultId) as any;
    const latestSeq = Number(maxRow?.max_seq ?? 0);

    const events: SyncEventRecord[] = rows.map(r => ({
      id: String(r.id),
      vault_id: String(r.vault_id),
      seq: Number(r.seq),
      payload_encrypted: String(r.payload_encrypted),
      created_at: Number(r.created_at)
    }));

    return { latest_seq: latestSeq, events };
  }

  async pruneOldEvents(olderThanTimestamp: number): Promise<number> {
    const res = this.db.prepare('DELETE FROM sync_events WHERE created_at < ?').run(olderThanTimestamp);
    return Number(res.changes);
  }
}
