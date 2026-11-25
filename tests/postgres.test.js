'use strict';

/**
 * Os mesmos testes sobre Postgres. Só correm se TEST_DATABASE_URL estiver definido
 * (uma base Postgres de TESTE, nunca a de produção). Cada teste usa uma tabela própria
 * (registos_teste_<aleatório>), apagada no fim, por isso as tabelas reais não são tocadas.
 *
 * Exemplo: TEST_DATABASE_URL=postgresql://postgres:senha@localhost:5432/registos_teste npm test
 */
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { registarTestes } = require('./suite');

const URL_TESTE = process.env.TEST_DATABASE_URL;

registarTestes(
  'Postgres',
  async (t) => {
    const tabela = `registos_teste_${randomBytes(6).toString('hex')}`;
    t.after(async () => {
      const pool = new Pool({ connectionString: URL_TESTE, ssl: false });
      await pool.query(`DROP TABLE IF EXISTS ${tabela}`);
      await pool.end();
    });
    return { databaseUrl: URL_TESTE, tabela };
  },
  { skip: URL_TESTE ? false : 'defina TEST_DATABASE_URL para testar com Postgres' }
);
