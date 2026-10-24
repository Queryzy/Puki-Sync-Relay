import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayApp } from '../dist/app.js';
import { SqliteDatabase } from '../dist/db/sqlite.js';
import { sha256Hex, computeHmacHex } from '../dist/crypto.js';

test('Puki Sync Relay - Full Lifecycle & Security Suite', async (t) => {
  const db = new SqliteDatabase(':memory:');
  const app = createRelayApp(() => db);

  let challengeData;
  const vaultId = 'test-vault-uuid-v4-1234567890';
  // 64-hex char auth key
  const authKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  await t.test('1. Health check responds 200 OK', async () => {
    const res = await app.request('/api/v1/health');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.service, 'puki-sync-relay');
  });

  await t.test('2. Get PoW Challenge', async () => {
    const res = await app.request('/api/v1/vault/challenge');
    assert.equal(res.status, 200);
    challengeData = await res.json();
    assert.ok(challengeData.challenge);
    assert.equal(challengeData.difficulty, 4);
    assert.ok(challengeData.expires_at > Date.now());
  });

  await t.test('3. Solve PoW and Init Vault', async () => {
    // Solve Proof-of-Work
    let nonce = 0;
    const targetPrefix = '0'.repeat(challengeData.difficulty);
    while (true) {
      const hash = await sha256Hex(`${challengeData.challenge}:${nonce}`);
      if (hash.startsWith(targetPrefix)) {
        break;
      }
      nonce++;
    }

    const initRes = await app.request('/api/v1/vault/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vault_id: vaultId,
        auth_verifier: authKeyHex,
        challenge: challengeData.challenge,
        nonce: String(nonce)
      })
    });

    assert.equal(initRes.status, 201);
    const initJson = await initRes.json();
    assert.equal(initJson.success, true);
    assert.equal(initJson.vault_id, vaultId);
  });

  await t.test('4. Duplicate Vault ID rejected with 409 Conflict', async () => {
    // Re-solve with new challenge
    const chRes = await app.request('/api/v1/vault/challenge');
    const ch = await chRes.json();
    let nonce = 0;
    while (true) {
      const hash = await sha256Hex(`${ch.challenge}:${nonce}`);
      if (hash.startsWith('0000')) break;
      nonce++;
    }

    const dupRes = await app.request('/api/v1/vault/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vault_id: vaultId,
        auth_verifier: authKeyHex,
        challenge: ch.challenge,
        nonce: String(nonce)
      })
    });
    assert.equal(dupRes.status, 409);
  });

  await t.test('5. Push rejected without valid signature', async () => {
    const pushBody = JSON.stringify({
      events: [{ id: 'evt-1', payload_encrypted: 'base64_test_payload' }]
    });

    const res = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-ID': vaultId,
        'X-Timestamp': String(Date.now()),
        'X-Signature': 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd'
      },
      body: pushBody
    });
    assert.equal(res.status, 401);
  });

  await t.test('6. Push with valid HMAC signature succeeds', async () => {
    const pushPayload = {
      events: [
        { id: 'evt-1', payload_encrypted: 'encrypted_search_query_yoasobi' },
        { id: 'evt-2', payload_encrypted: 'encrypted_play_history_track_99' }
      ]
    };
    const bodyStr = JSON.stringify(pushPayload);
    const timestamp = Date.now();
    const message = `${vaultId}:${timestamp}:${bodyStr}`;
    const sig = await computeHmacHex(authKeyHex, message);

    const res = await app.request('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-ID': vaultId,
        'X-Timestamp': String(timestamp),
        'X-Signature': sig
      },
      body: bodyStr
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.synced, 2);
    assert.equal(json.latest_seq, 2);
  });

  await t.test('7. Pull delta events with valid HMAC signature', async () => {
    const timestamp = Date.now();
    const message = `${vaultId}:${timestamp}:`;
    const sig = await computeHmacHex(authKeyHex, message);

    const res = await app.request(`/api/v1/sync/pull?since_seq=0`, {
      method: 'GET',
      headers: {
        'X-Vault-ID': vaultId,
        'X-Timestamp': String(timestamp),
        'X-Signature': sig
      }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.latest_seq, 2);
    assert.equal(json.events.length, 2);
    assert.equal(json.events[0].id, 'evt-1');
    assert.equal(json.events[0].payload_encrypted, 'encrypted_search_query_yoasobi');
    assert.equal(json.events[1].id, 'evt-2');
    assert.equal(json.events[1].payload_encrypted, 'encrypted_play_history_track_99');
  });

  await t.test('8. Pull with since_seq=1 returns only new events', async () => {
    const timestamp = Date.now();
    const message = `${vaultId}:${timestamp}:`;
    const sig = await computeHmacHex(authKeyHex, message);

    const res = await app.request(`/api/v1/sync/pull?since_seq=1`, {
      method: 'GET',
      headers: {
        'X-Vault-ID': vaultId,
        'X-Timestamp': String(timestamp),
        'X-Signature': sig
      }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.events.length, 1);
    assert.equal(json.events[0].id, 'evt-2');
  });
});
