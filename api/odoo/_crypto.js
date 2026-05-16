const crypto = require('crypto');

const BLOCK_SIZE = 16;

function getKeyBuffer(secret) {
  const rawSecret = String(secret || '');
  if (!rawSecret.trim()) {
    throw new Error('ODOO_AUTH_SECRET is required');
  }

  const key = Buffer.from(rawSecret, 'utf8');
  if (![16, 24, 32].includes(key.length)) {
    throw new Error('ODOO_AUTH_SECRET must be 16, 24, or 32 UTF-8 bytes');
  }
  return key;
}

function getCipherName(secret) {
  const key = getKeyBuffer(secret);
  if (key.length === 16) {
    return 'aes-128-cbc';
  }
  if (key.length === 24) {
    return 'aes-192-cbc';
  }
  return 'aes-256-cbc';
}

function encryptAes256Cbc(plaintext, secret, iv) {
  const key = getKeyBuffer(secret);
  const cipherName = getCipherName(secret);
  const vector = iv ? Buffer.from(iv) : crypto.randomBytes(BLOCK_SIZE);
  if (vector.length !== BLOCK_SIZE) {
    throw new Error('AES-CBC IV must be 16 bytes');
  }
  const cipher = crypto.createCipheriv(cipherName, key, vector);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);
  return Buffer.concat([vector, encrypted]).toString('base64');
}

function decryptAes256Cbc(encodedText, secret) {
  const key = getKeyBuffer(secret);
  const cipherName = getCipherName(secret);
  const raw = Buffer.from(String(encodedText || ''), 'base64');
  if (raw.length <= BLOCK_SIZE) {
    throw new Error('Encrypted payload is too short');
  }
  const iv = raw.subarray(0, BLOCK_SIZE);
  const payload = raw.subarray(BLOCK_SIZE);
  const decipher = crypto.createDecipheriv(cipherName, key, iv);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  BLOCK_SIZE,
  getKeyBuffer,
  getCipherName,
  encryptAes256Cbc,
  decryptAes256Cbc
};
