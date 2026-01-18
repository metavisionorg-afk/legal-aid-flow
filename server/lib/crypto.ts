// AES-256-GCM encryption utilities for secure storage of integration secrets
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

/**
 * Get the master encryption key from environment
 * Key should be 32 bytes (256 bits) in base64 or hex format
 */
function getMasterKey(): Buffer {
  const keyEnv = process.env.INTEGRATIONS_ENC_KEY;
  
  if (!keyEnv) {
    throw new Error('INTEGRATIONS_ENC_KEY not set. Required for encrypting integration secrets.');
  }

  try {
    // Try base64 first
    const keyBuffer = Buffer.from(keyEnv, 'base64');
    if (keyBuffer.length === 32) {
      return keyBuffer;
    }

    // Try hex
    const keyBufferHex = Buffer.from(keyEnv, 'hex');
    if (keyBufferHex.length === 32) {
      return keyBufferHex;
    }

    // If raw string, derive key using PBKDF2
    const salt = Buffer.from('legal-aidflow-integrations-salt'); // Static salt for deterministic key derivation
    return crypto.pbkdf2Sync(keyEnv, salt, 100000, 32, 'sha256');
  } catch (error) {
    throw new Error('Invalid INTEGRATIONS_ENC_KEY format. Must be 32-byte base64/hex or passphrase.');
  }
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns: base64-encoded string containing: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty plaintext');
  }

  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();

  // Combine: iv + authTag + ciphertext (all base64)
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * Input: base64-encoded string containing: iv + authTag + ciphertext
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty ciphertext');
  }

  const masterKey = getMasterKey();
  const combined = Buffer.from(ciphertext, 'base64');

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if encryption is available (key is set)
 */
export function isEncryptionAvailable(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random 32-byte key in base64 format (for initial setup)
 */
export function generateKey(): string {
  return crypto.randomBytes(32).toString('base64');
}
