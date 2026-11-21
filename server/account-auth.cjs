'use strict';
// Только криптографические примитивы. Серверная авторизация и хранение прогресса
// должны подключаться отдельно, после проверки протокола и миграции старых ников.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const RESET_TTL_MS = 30 * 60 * 1000;

function validPassword(password) {
  return typeof password === 'string' && password.length >= 10 && Buffer.byteLength(password, 'utf8') <= 256;
}
async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('Пароль должен быть не короче 10 символов и не длиннее 256 байт');
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT_OPTIONS);
  return `scrypt-v1:${salt.toString('hex')}:${hash.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  if (!validPassword(password) || typeof encoded !== 'string') return false;
  const m = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{64})$/.exec(encoded);
  if (!m) return false;
  const expected = Buffer.from(m[2], 'hex');
  const actual = await scrypt(password, Buffer.from(m[1], 'hex'), 32, SCRYPT_OPTIONS);
  return crypto.timingSafeEqual(actual, expected);
}
function createReset(now = Date.now()) {
  const code = crypto.randomBytes(32).toString('base64url');
  return { code, digest: resetDigest(code), expiresAt: now + RESET_TTL_MS };
}
function resetDigest(code) {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}
function verifyReset(code, digest, expiresAt, now = Date.now()) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code) || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) || !Number.isFinite(expiresAt) || now >= expiresAt) return false;
  return crypto.timingSafeEqual(Buffer.from(resetDigest(code), 'hex'), Buffer.from(digest, 'hex'));
}
module.exports = { validPassword, hashPassword, verifyPassword, createReset, verifyReset, RESET_TTL_MS };
