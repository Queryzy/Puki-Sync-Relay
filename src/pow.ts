import { sha256Hex, computeHmacHex, timingSafeEqualHex } from './crypto.js';

// Default difficulty: 4 leading hex zeros (requires ~65k hashes on avg, ~50-100ms on mobile)
export const POW_DIFFICULTY = 4;
export const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Secret salt for stateless challenge verification
const SERVER_CHALLENGE_KEY = 'puki_relay_challenge_secret_v1';

export async function generateChallenge(): Promise<{ challenge: string; difficulty: number; expires_at: number }> {
  const timestamp = Date.now();
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const salt = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const raw = `${timestamp}:${salt}`;
  const sig = await computeHmacHex(SERVER_CHALLENGE_KEY, raw);
  const challenge = `${raw}:${sig}`;

  return {
    challenge,
    difficulty: POW_DIFFICULTY,
    expires_at: timestamp + CHALLENGE_TTL_MS
  };
}

export async function verifyPoW(challenge: string, nonce: string): Promise<boolean> {
  const parts = challenge.split(':');
  if (parts.length !== 3) return false;

  const [tsStr, salt, sig] = parts;
  const timestamp = parseInt(tsStr, 10);
  if (isNaN(timestamp)) return false;

  // Check TTL
  const now = Date.now();
  if (now < timestamp || now - timestamp > CHALLENGE_TTL_MS) {
    return false;
  }

  // Verify challenge authenticity
  const expectedSig = await computeHmacHex(SERVER_CHALLENGE_KEY, `${tsStr}:${salt}`);
  if (!timingSafeEqualHex(expectedSig.toLowerCase(), sig.toLowerCase())) {
    return false;
  }

  // Verify proof of work (hash must start with `0` repeated `POW_DIFFICULTY` times)
  const hash = await sha256Hex(`${challenge}:${nonce}`);
  const targetPrefix = '0'.repeat(POW_DIFFICULTY);
  return hash.startsWith(targetPrefix);
}
