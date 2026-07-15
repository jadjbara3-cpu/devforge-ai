/**
 * AES-256-GCM encryption for secrets stored at rest in SQLite.
 *
 * Design goals:
 *   - Zero external deps — uses Node.js built-in `crypto` only.
 *   - Keys are tied to the host machine (hostname + OS user + salt). Copying
 *     the SQLite DB to another machine yields ciphertext that cannot be
 *     decrypted there. Good security property for a local-first app.
 *   - Backward compatible: `decrypt()` auto-detects legacy plaintext keys
 *     (anything not prefixed with `enc:`) and returns them as-is, so existing
 *     users don't lose their keys. Callers can opt-in to transparent
 *     re-encryption on first read.
 *   - Wire format: `enc:<iv>:<authTag>:<ciphertext>` (all base64url).
 *     The `enc:` prefix is the version tag / magic marker; future formats
 *     can bump it (`enc2:`, etc.).
 *
 * The encryption layer is transparent to the rest of the app: only
 * `lib/ai-providers.ts` and `app/api/provider/**` import from this module.
 */

import crypto from "node:crypto";
import os from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker prefix that distinguishes encrypted ciphertext from legacy plaintext. */
export const ENC_PREFIX = "enc:";

/** Salt version — bump (e.g. to `devforge-salt-v2`) to force re-keying. */
const MACHINE_SALT = "devforge-salt-v1";

/** AES-256 needs a 32-byte key. GCM standard nonce is 12 bytes. */
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

// ---------------------------------------------------------------------------
// Machine-bound key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a 32-byte AES-256 key from the host machine's identity.
 *
 * Identity = SHA-256( hostname + OS username + salt ).
 *
 * Properties:
 *   - Stable across process restarts on the same machine.
 *   - Changes if the user renames the machine or OS account (intentional —
 *     old ciphertext becomes undecryptable, which surfaces as a soft error
 *     the UI can handle).
 *   - Not exposed to the browser — this runs server-side only.
 *
 * Override: set `DEVFORGE_ENCRYPTION_KEY` (hex or utf-8 ≥32 chars) in the
 * environment to pin the key explicitly (useful for portable installs on
 * USB drives where the hostname/username vary).
 */
export function getMachineKey(): Buffer {
  const envKey = process.env.DEVFORGE_ENCRYPTION_KEY?.trim();
  if (envKey) {
    // Hex string → decode directly.
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }
    // Otherwise hash the env value to get exactly 32 bytes.
    return crypto.createHash("sha256").update(envKey).digest();
  }

  let hostname = "unknown-host";
  let username = "unknown-user";
  try {
    hostname = os.hostname() || hostname;
  } catch {
    /* ignore — keep default */
  }
  try {
    username = os.userInfo().username || username;
  } catch {
    /* ignore — keep default */
  }

  const material = `${hostname}:${username}:${MACHINE_SALT}`;
  const key = crypto.createHash("sha256").update(material).digest();
  if (key.length !== KEY_BYTES) {
    // Defensive — SHA-256 always produces 32 bytes; this never fires.
    throw new Error(
      `[crypto] Derived key length ${key.length} != ${KEY_BYTES}`,
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Base64url helpers (URL-safe, no padding) — keeps ciphertext compact and
// safe to embed in JSON / SQLite TEXT columns without escaping headaches.
// ---------------------------------------------------------------------------

function toB64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

// ---------------------------------------------------------------------------
// Public: encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-256-GCM using the machine-derived key.
 *
 * Returns `enc:<iv>:<authTag>:<ciphertext>` — all components base64url.
 * A fresh random IV is generated per call (never reused).
 *
 * Idempotency: NOT idempotent — encrypting the same plaintext twice yields
 * two different ciphertexts (because of the random IV). This is correct and
 * expected for authenticated encryption.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("[crypto] encrypt() expects a string");
  }
  // Already encrypted? Don't double-encrypt (e.g. if a caller passes a value
  // read straight from the DB back into upsert). Return as-is.
  if (isEncrypted(plaintext)) {
    return plaintext;
  }
  if (plaintext === "") {
    // Preserve empty-string semantics — empty in, empty out.
    return "";
  }

  const key = getMachineKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${toB64url(iv)}:${toB64url(authTag)}:${toB64url(ciphertext)}`;
}

/**
 * Decrypt a value produced by `encrypt()`.
 *
 * Backward compatibility: if the input does NOT start with `enc:`, it is
 * treated as a legacy plaintext key and returned as-is. This makes the
 * encryption rollout transparent — existing DB rows keep working until they
 * are re-written by `upsertProviderConfig` (which always encrypts).
 *
 * Throws only if the value IS prefixed but the ciphertext is corrupt or the
 * auth tag fails verification (i.e. tampering or wrong machine key). The
 * caller can catch and surface a helpful error to the UI.
 */
export function decrypt(encrypted: string): string {
  if (typeof encrypted !== "string") {
    throw new TypeError("[crypto] decrypt() expects a string");
  }
  if (encrypted === "") return "";
  if (!isEncrypted(encrypted)) {
    // Legacy plaintext — return as-is for backward compat.
    return encrypted;
  }

  const stripped = encrypted.slice(ENC_PREFIX.length);
  const parts = stripped.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "[crypto] Malformed ciphertext — expected `enc:<iv>:<authTag>:<ct>`",
    );
  }
  const [ivB64, authTagB64, ctB64] = parts;
  const iv = fromB64url(ivB64);
  const authTag = fromB64url(authTagB64);
  const ciphertext = fromB64url(ctB64);

  const key = getMachineKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch (err) {
    // Auth-tag mismatch: wrong machine key, tampering, or corrupted DB.
    const reason =
      err instanceof Error ? err.message : "auth tag verification failed";
    throw new Error(
      `[crypto] Decryption failed — key may belong to a different machine, or the ciphertext was tampered with. (${reason})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public: format detection
// ---------------------------------------------------------------------------

/** Returns true if the value looks like output of `encrypt()` (has `enc:` prefix). */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * Returns true if the value is a legacy plaintext key (i.e. stored before
 * encryption was rolled out). Empty strings are treated as "neither".
 */
export function isPlaintext(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value === "") return false;
  return !isEncrypted(value);
}

// ---------------------------------------------------------------------------
// Public: masking (for UI display + API responses)
// ---------------------------------------------------------------------------

/**
 * Mask an API key for display in the UI or for returning in API responses.
 *
 * Format: first 4 + `****` + last 4 — e.g. `sk-1abcdwxyz` → `sk-1****wxyz`.
 * For very short keys (≤8 chars), mask everything except the last 2 chars.
 * Empty input → empty string (caller can render a placeholder).
 *
 * This is the ONLY transformation applied to keys before they leave the
 * server. Decrypted plaintext keys NEVER cross the wire except via the
 * explicit `reveal: true` admin endpoint.
 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  const len = key.length;
  if (len <= 8) {
    // Too short to safely mask — show only the last 2 chars.
    return `${"•".repeat(Math.max(len - 2, 0))}${key.slice(-2)}`;
  }
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
