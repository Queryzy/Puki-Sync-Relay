export interface VaultRecord {
  vault_id: string;
  auth_verifier: string;
  created_at: number;
}

export interface SyncEventRecord {
  id: string;
  vault_id: string;
  seq: number;
  payload_encrypted: string;
  created_at: number;
}

export interface PushEventItem {
  id: string;
  payload_encrypted: string;
}

export interface PushRequest {
  events: PushEventItem[];
}

export interface InitVaultRequest {
  vault_id: string;
  auth_verifier: string;
  challenge: string;
  nonce: string;
}

export interface ChallengeResponse {
  challenge: string;
  difficulty: number;
  expires_at: number;
}

export interface PullResponse {
  latest_seq: number;
  events: {
    id: string;
    seq: number;
    payload_encrypted: string;
    created_at: number;
  }[];
}
