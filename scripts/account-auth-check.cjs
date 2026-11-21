'use strict';
const assert = require('node:assert/strict');
const auth = require('../server/account-auth.cjs');
(async () => {
  const password = 'Тестовый пароль 123';
  const a = await auth.hashPassword(password), b = await auth.hashPassword(password);
  assert.notEqual(a, b, 'соль должна быть случайной');
  assert(!a.includes(password), 'пароль не должен храниться открытым текстом');
  assert(await auth.verifyPassword(password, a));
  assert(!(await auth.verifyPassword('неверный пароль 123', a)));
  assert(!(await auth.verifyPassword(password, 'bad')));
  await assert.rejects(auth.hashPassword('short'));
  const r = auth.createReset(1000);
  assert(auth.verifyReset(r.code, r.digest, r.expiresAt, 1001));
  assert(!auth.verifyReset(r.code, r.digest, r.expiresAt, r.expiresAt));
  assert(!auth.verifyReset('x'.repeat(43), r.digest, r.expiresAt, 1001));
  assert(!r.digest.includes(r.code));
  console.log('✓ scrypt, случайная соль, неверный пароль, код восстановления с ограниченным сроком');
})().catch(e => { console.error(e); process.exitCode = 1; });
