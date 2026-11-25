'use strict';

const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const TAMANHO = 64;

/** Devolve "scrypt$<sal>$<hash>". A password em claro nunca é guardada. */
async function gerarHash(password) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(password, sal, TAMANHO);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

async function verificarPassword(password, guardado) {
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt') return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = await scryptAsync(password, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(calculado, esperado);
}

module.exports = { gerarHash, verificarPassword };
