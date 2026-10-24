// Standard Web Crypto API helpers (compatible with Cloudflare Workers & Node.js 20+)

export async function sha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let c = 0;
  for (let i = 0; i < a.length; i++) {
    c |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return c === 0;
}

export async function computeHmacHex(keyHex: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const keyBytes = new Uint8Array(
    (keyHex.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16))
  );

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyHmac(keyHex: string, data: string, signatureHex: string): Promise<boolean> {
  const expected = await computeHmacHex(keyHex, data);
  return timingSafeEqualHex(expected.toLowerCase(), signatureHex.toLowerCase());
}
