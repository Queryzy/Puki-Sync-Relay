import { Hono } from 'hono';
import { IDatabase } from './db/interface.js';
import { verifyHmac } from './crypto.js';
import { generateChallenge, verifyPoW } from './pow.js';
import { PushRequest, InitVaultRequest } from './types.js';

export type RelayVariables = {
  verifiedBody: string;
  verifiedVaultId: string;
};

export function createRelayApp(getDb: (c: any) => IDatabase) {
  const app = new Hono<{ Variables: RelayVariables }>();

  // Global Error Handler
  app.onError((err, c) => {
    console.error('Relay Error:', err);
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  });

  // CORS Middleware
  app.use('*', async (c, next) => {
    await next();
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Content-Type, X-Vault-ID, X-Timestamp, X-Signature');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  });

  app.options('*', (c) => c.body(null, 204));

  // 1. Health Check
  app.get('/api/v1/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'puki-sync-relay',
      time: Date.now()
    });
  });

  // 2. PoW Challenge
  app.get('/api/v1/vault/challenge', async (c) => {
    const challenge = await generateChallenge();
    return c.json(challenge);
  });

  // 3. Vault Initialization (TOFU + PoW Protected)
  app.post('/api/v1/vault/init', async (c) => {
    let body: InitVaultRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { vault_id, auth_verifier, challenge, nonce } = body;

    // Validate inputs
    if (!vault_id || typeof vault_id !== 'string' || vault_id.length < 16 || vault_id.length > 64) {
      return c.json({ error: 'Invalid vault_id (must be 16-64 chars)' }, 400);
    }

    if (!auth_verifier || typeof auth_verifier !== 'string' || !/^[0-9a-fA-F]{64}$/.test(auth_verifier)) {
      return c.json({ error: 'Invalid auth_verifier (must be 64 hex chars)' }, 400);
    }

    if (!challenge || !nonce) {
      return c.json({ error: 'Missing challenge or nonce for Proof-of-Work' }, 400);
    }

    // Verify Proof-of-Work
    const powValid = await verifyPoW(challenge, String(nonce));
    if (!powValid) {
      return c.json({ error: 'Proof-of-Work failed or expired' }, 403);
    }

    const db = getDb(c);
    const res = await db.initVault(vault_id, auth_verifier, Date.now());

    return c.json({ success: true, vault_id, updated: res.updated || false }, res.updated ? 200 : 201);
  });

  // Authentication Middleware for /api/v1/sync/*
  app.use('/api/v1/sync/*', async (c, next) => {
    const vaultId = c.req.header('X-Vault-ID');
    const timestampHeader = c.req.header('X-Timestamp');
    const signature = c.req.header('X-Signature');

    if (!vaultId || !timestampHeader || !signature) {
      return c.json({ error: 'Missing authentication headers (X-Vault-ID, X-Timestamp, X-Signature)' }, 401);
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      return c.json({ error: 'Invalid X-Timestamp header' }, 401);
    }

    // Replay attack guard: max 5 minutes clock drift
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return c.json({ error: 'Timestamp expired or out of sync (max 5 minutes drift allowed)' }, 401);
    }

    const db = getDb(c);
    const vault = await db.getVault(vaultId);
    if (!vault) {
      return c.json({ error: 'Vault not found. Please register first.' }, 404);
    }

    // Clone body text for HMAC verification
    let rawBody = '';
    if (c.req.method === 'POST') {
      rawBody = await c.req.text();
      if (rawBody.length > 65536) {
        return c.json({ error: 'Payload too large (max 64KB)' }, 413);
      }
    }

    const message = `${vaultId}:${timestamp}:${rawBody}`;
    const isValid = await verifyHmac(vault.auth_verifier, message, signature);

    if (!isValid) {
      return c.json({ error: 'Invalid HMAC signature' }, 401);
    }

    // Store verified rawBody on context for push endpoint
    c.set('verifiedBody', rawBody);
    c.set('verifiedVaultId', vaultId);

    await next();
  });

  // 4. Push Delta Events
  app.post('/api/v1/sync/push', async (c) => {
    const vaultId = c.get('verifiedVaultId');
    const rawBody = c.get('verifiedBody');

    let parsed: PushRequest;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    if (!parsed.events || !Array.isArray(parsed.events)) {
      return c.json({ error: 'Field "events" must be an array' }, 400);
    }

    if (parsed.events.length > 50) {
      return c.json({ error: 'Batch push limit exceeded (max 50 events per request)' }, 400);
    }

    for (const evt of parsed.events) {
      if (!evt.id || typeof evt.id !== 'string') {
        return c.json({ error: 'Each event must contain a valid string "id"' }, 400);
      }
      if (!evt.payload_encrypted || typeof evt.payload_encrypted !== 'string') {
        return c.json({ error: 'Each event must contain a string "payload_encrypted"' }, 400);
      }
      if (evt.payload_encrypted.length > 16384) {
        return c.json({ error: 'Individual event payload exceeds 16KB limit' }, 400);
      }
    }

    const db = getDb(c);
    const result = await db.pushEvents(vaultId, parsed.events, Date.now());

    return c.json({
      synced: result.syncedCount,
      latest_seq: result.latestSeq
    });
  });

  // 5. Pull Delta Events
  app.get('/api/v1/sync/pull', async (c) => {
    const vaultId = c.get('verifiedVaultId');
    const sinceSeqParam = c.req.query('since_seq');
    const sinceSeq = sinceSeqParam ? parseInt(sinceSeqParam, 10) : 0;

    const db = getDb(c);
    const result = await db.pullEvents(vaultId, isNaN(sinceSeq) ? 0 : sinceSeq, 200);

    return c.json(result);
  });

  return app;
}
