/**
 * Password hashing: PBKDF2-HMAC-SHA256 (RFC 8018) with a per-user random salt.
 *
 * Why this file exists rather than one call to `expo-crypto`:
 * `Crypto.digestStringAsync` is a *single pass* hash. Storing that is
 * equivalent to storing a fast hash of the password, and an `.apk` with a
 * readable SQLite file inside it can be unzipped and dumped. Salting and
 * iterating is what makes that dump expensive to attack.
 *
 * PBKDF2 is implemented here, on top of `Crypto.digest`, instead of pulling in
 * `react-native-quick-crypto` or `react-native-argon2`:
 *  - it is a published standard, not a homebrew scheme;
 *  - HMAC is a few lines, so there is no crypto library to audit;
 *  - it stays pure and dependency-free, so it is testable like the rest of
 *    `utils/`.
 *
 * If you swap this for a native KDF, only `hashPassword` and `verifyPassword`
 * change — they are the only two exports anything else imports. The stored
 * format is self-describing, so raising `PBKDF2_ITERATIONS` later still lets
 * existing accounts log in. See vault note `Security`.
 */

import * as Crypto from 'expo-crypto';

const SHA256 = Crypto.CryptoDigestAlgorithm.SHA256;
const BLOCK_SIZE = 64;
const SALT_BYTES = 16;

/**
 * Deliberately modest. Each iteration is two native `digest` calls, so the cost
 * is real on a low-end phone; a 10-second login is a support ticket. Raise this
 * if you add `react-native-quick-crypto` and use a native PBKDF2.
 */
export const PBKDF2_ITERATIONS = 10_000;

const ALGORITHM_TAG = 'pbkdf2-sha256';

// ── byte helpers ─────────────────────────────────────────────────────────

/**
 * Pinned to a non-shared `ArrayBuffer` because `Crypto.digest` takes a
 * `BufferSource`, which rejects `ArrayBufferLike` (it may be a
 * `SharedArrayBuffer`).
 */
type Bytes = Uint8Array<ArrayBuffer>;

const toBytes = (source: Uint8Array): Bytes => new Uint8Array(source);

const xorInto = (target: Bytes, source: Bytes, start: number): void => {
  for (let i = 0; i < source.length; i += 1) target[start + i] ^= source[i];
};

/** HMAC-SHA256 over raw bytes (RFC 2104). */
const hmacSha256 = async (key: Bytes, message: Bytes): Promise<Bytes> => {
  const hashed =
    key.length > BLOCK_SIZE ? new Uint8Array(await Crypto.digest(SHA256, key)) : key;

  const paddedKey = new Uint8Array(BLOCK_SIZE);
  paddedKey.set(hashed);

  const innerPad = new Uint8Array(paddedKey);
  xorInto(innerPad, new Uint8Array(BLOCK_SIZE).fill(0x36), 0);
  const inner = new Uint8Array(BLOCK_SIZE + message.length);
  inner.set(innerPad, 0);
  inner.set(message, BLOCK_SIZE);
  const innerHash = new Uint8Array(await Crypto.digest(SHA256, inner));

  const outerPad = new Uint8Array(paddedKey);
  xorInto(outerPad, new Uint8Array(BLOCK_SIZE).fill(0x5c), 0);
  const outer = new Uint8Array(BLOCK_SIZE + innerHash.length);
  outer.set(outerPad, 0);
  outer.set(innerHash, BLOCK_SIZE);

  return new Uint8Array(await Crypto.digest(SHA256, outer));
};

/**
 * PBKDF2 for a 32-byte output, which is exactly one HMAC block, so only the
 * `INT(1)` counter block is needed.
 */
const pbkdf2Sha256 = async (
  password: string,
  salt: Bytes,
  iterations: number,
): Promise<Bytes> => {
  const key = toBytes(new TextEncoder().encode(password));

  const seed = new Uint8Array(salt.length + 4);
  seed.set(salt, 0);
  seed.set([0x00, 0x00, 0x00, 0x01], salt.length);

  let u = await hmacSha256(key, seed);
  const derived = new Uint8Array(u);

  for (let i = 1; i < iterations; i += 1) {
    u = await hmacSha256(key, u);
    xorInto(derived, u, 0);
  }

  return derived;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Bytes => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

/** Length-independent, early-returning comparison. */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// ── public API ───────────────────────────────────────────────────────────

export interface ParsedHash {
  iterations: number;
  salt: string;
  hash: string;
}

/** `pbkdf2-sha256$10000$<saltHex>$<hashHex>` */
export const hashPassword = async (
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> => {
  const salt = toBytes(await Crypto.getRandomBytesAsync(SALT_BYTES));
  const derived = await pbkdf2Sha256(password, salt, iterations);
  return `${ALGORITHM_TAG}$${iterations}$${toHex(salt)}$${toHex(derived)}`;
};

export const parseHash = (stored: string): ParsedHash | null => {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== ALGORITHM_TAG) return null;

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  if (!/^[0-9a-f]+$/.test(parts[2]) || !/^[0-9a-f]+$/.test(parts[3])) return null;

  return { iterations, salt: parts[2], hash: parts[3] };
};

/** Returns false — never throws — on a malformed or non-matching hash. */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parsed = parseHash(stored);
  if (!parsed) return false;

  const derived = await pbkdf2Sha256(password, fromHex(parsed.salt), parsed.iterations);
  return timingSafeEqual(toHex(derived), parsed.hash);
};

/**
 * True when a stored hash used fewer iterations than the current default, so
 * the caller can re-hash it on the next successful login.
 */
export const needsRehash = (stored: string): boolean => {
  const parsed = parseHash(stored);
  return parsed === null || parsed.iterations < PBKDF2_ITERATIONS;
};
