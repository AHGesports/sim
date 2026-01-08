/**
 * Encryption utility for sensitive data like database connection URIs.
 * Uses AES-256-GCM for authenticated encryption.
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Get the encryption key from environment variables.
 * The key must be a 32-byte hex string (64 characters).
 *
 * @returns Encryption key as Buffer
 * @throws Error if key is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.NEON_CONNECTION_ENCRYPTION_KEY

  if (!keyHex) {
    throw new Error('NEON_CONNECTION_ENCRYPTION_KEY environment variable is not set')
  }

  if (keyHex.length !== 64) {
    throw new Error(
      'NEON_CONNECTION_ENCRYPTION_KEY must be a 32-byte hex string (64 characters). ' +
        'Generate one with: openssl rand -hex 32'
    )
  }

  return Buffer.from(keyHex, 'hex')
}

/**
 * Encrypt a string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a string encrypted with the encrypt() function.
 *
 * @param encryptedText - The encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (invalid format, wrong key, or tampered data)
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey()

  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format. Expected iv:authTag:ciphertext')
  }

  const [ivHex, authTagHex, encrypted] = parts

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes`)
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length. Expected ${AUTH_TAG_LENGTH} bytes`)
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Check if a string is encrypted (matches our format).
 *
 * @param text - The string to check
 * @returns True if the string appears to be encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false

  const parts = text.split(':')
  if (parts.length !== 3) return false

  const [ivHex, authTagHex] = parts

  // Check if IV and auth tag are valid hex of correct length
  const ivValid = /^[0-9a-f]{32}$/i.test(ivHex)
  const authTagValid = /^[0-9a-f]{32}$/i.test(authTagHex)

  return ivValid && authTagValid
}

/**
 * Mask a connection string for display (hide password).
 *
 * @param connectionUri - The full connection URI
 * @returns Connection URI with password replaced by ****
 */
export function maskConnectionUri(connectionUri: string): string {
  // Match pattern: protocol://user:password@host
  return connectionUri.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1****$2')
}

/**
 * Safely encrypt if not already encrypted.
 *
 * @param text - The string to encrypt
 * @returns Encrypted string
 */
export function ensureEncrypted(text: string): string {
  if (isEncrypted(text)) {
    return text
  }
  return encrypt(text)
}

/**
 * Safely decrypt if encrypted, otherwise return as-is.
 *
 * @param text - The string to decrypt
 * @returns Decrypted string or original if not encrypted
 */
export function ensureDecrypted(text: string): string {
  if (!isEncrypted(text)) {
    return text
  }
  return decrypt(text)
}
