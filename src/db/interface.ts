import { VaultRecord, SyncEventRecord, PushEventItem } from '../types.js';

export interface IDatabase {
  initVault(vaultId: string, authVerifier: string, createdAt: number): Promise<{ success: boolean; conflict?: boolean; updated?: boolean }>;
  getVault(vaultId: string): Promise<VaultRecord | null>;
  pushEvents(vaultId: string, events: PushEventItem[], createdAt: number): Promise<{ syncedCount: number; latestSeq: number }>;
  pullEvents(vaultId: string, sinceSeq: number, limit?: number): Promise<{ latest_seq: number; events: SyncEventRecord[] }>;
  pruneOldEvents(olderThanTimestamp: number, maxEventsPerVault?: number): Promise<number>;
}
