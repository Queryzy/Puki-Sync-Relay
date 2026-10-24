import { IDatabase } from './interface.js';
import { VaultRecord, SyncEventRecord, PushEventItem } from '../types.js';

export class D1DatabaseAdapter implements IDatabase {
  constructor(private d1: D1Database) {}

  async initVault(vaultId: string, authVerifier: string, createdAt: number): Promise<{ success: boolean; conflict?: boolean; updated?: boolean }> {
    const existing = await this.d1.prepare('SELECT vault_id FROM vaults WHERE vault_id = ?').bind(vaultId).first();

    await this.d1.prepare(`
      INSERT INTO vaults (vault_id, auth_verifier, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(vault_id) DO UPDATE SET auth_verifier = excluded.auth_verifier
    `)
      .bind(vaultId, authVerifier, createdAt)
      .run();

    return { success: true, updated: !!existing };
  }

  async getVault(vaultId: string): Promise<VaultRecord | null> {
    const row = await this.d1.prepare('SELECT vault_id, auth_verifier, created_at FROM vaults WHERE vault_id = ?')
      .bind(vaultId)
      .first<any>();

    if (!row) return null;
    return {
      vault_id: String(row.vault_id),
      auth_verifier: String(row.auth_verifier),
      created_at: Number(row.created_at)
    };
  }

  async pushEvents(vaultId: string, events: PushEventItem[], createdAt: number): Promise<{ syncedCount: number; latestSeq: number }> {
    const maxRow = await this.d1.prepare('SELECT MAX(seq) as max_seq FROM sync_events WHERE vault_id = ?')
      .bind(vaultId)
      .first<{ max_seq: number | null }>();

    let currentSeq = Number(maxRow?.max_seq ?? 0);
    if (events.length === 0) {
      return { syncedCount: 0, latestSeq: currentSeq };
    }

    const statements: D1PreparedStatement[] = [];
    for (const evt of events) {
      currentSeq += 1;
      statements.push(
        this.d1.prepare(`
          INSERT OR IGNORE INTO sync_events (id, vault_id, seq, payload_encrypted, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(evt.id, vaultId, currentSeq, evt.payload_encrypted, createdAt)
      );
    }

    // Execute batch
    const results = await this.d1.batch(statements);
    let inserted = 0;
    for (const r of results) {
      if ((r.meta.changes ?? 0) > 0) {
        inserted += 1;
      }
    }

    // Circular buffer: keep 500 latest events per vault
    await this.d1.prepare(`
      DELETE FROM sync_events
      WHERE vault_id = ? AND seq <= (
        SELECT seq FROM sync_events WHERE vault_id = ? ORDER BY seq DESC LIMIT 1 OFFSET 500
      )
    `).bind(vaultId, vaultId).run();

    return { syncedCount: inserted, latestSeq: currentSeq };
  }

  async pullEvents(vaultId: string, sinceSeq: number, limit: number = 200): Promise<{ latest_seq: number; events: SyncEventRecord[] }> {
    const { results } = await this.d1.prepare(`
      SELECT id, vault_id, seq, payload_encrypted, created_at
      FROM sync_events
      WHERE vault_id = ? AND seq > ?
      ORDER BY seq ASC
      LIMIT ?
    `).bind(vaultId, sinceSeq, limit).all<any>();

    const maxRow = await this.d1.prepare('SELECT MAX(seq) as max_seq FROM sync_events WHERE vault_id = ?')
      .bind(vaultId)
      .first<{ max_seq: number | null }>();

    const latestSeq = Number(maxRow?.max_seq ?? 0);
    const events: SyncEventRecord[] = (results || []).map(r => ({
      id: String(r.id),
      vault_id: String(r.vault_id),
      seq: Number(r.seq),
      payload_encrypted: String(r.payload_encrypted),
      created_at: Number(r.created_at)
    }));

    return { latest_seq: latestSeq, events };
  }

  async pruneOldEvents(olderThanTimestamp: number): Promise<number> {
    const res = await this.d1.prepare('DELETE FROM sync_events WHERE created_at < ?')
      .bind(olderThanTimestamp)
      .run();
    return res.meta.changes ?? 0;
  }
}
