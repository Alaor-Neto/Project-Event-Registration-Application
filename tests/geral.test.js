'use strict';

/** Testes extra que não dependem da base de dados. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { lerConfig, validarDatabaseUrl, ErroConfiguracao } = require('../src/config');
const { gerarHash, verificarPassword } = require('../src/seguranca');
const { datahora } = require('../src/formatar');
const { validarRegisto } = require('../src/validacao');
const { explicarErroLigacao, emailDuplicado } = require('../src/db');

const BASE = { ORGANIZER_EMAIL: 'a@b.pt', ORGANIZER_PASSWORD: 'uma-password-real' };

test('a password é guardada só como hash', async () => {
  const hash = await gerarHash('segredo123');
  assert.ok(!hash.includes('segredo123'));
  assert.equal(await verificarPassword('segredo123', hash), true);
  assert.equal(await verificarPassword('errada', hash), false);
});

test('sem password (ou com valores de exemplo) a aplicação recusa arrancar', () => {
  assert.throws(() => lerConfig({ ORGANIZER_EMAIL: 'a@b.pt' }), ErroConfiguracao);
  assert.throws(() => lerConfig({ ...BASE, ORGANIZER_PASSWORD: 'mudar-esta-password' }), ErroConfiguracao);
  assert.throws(() => lerConfig({ ...BASE, SECRET_KEY: 'troca-por-uma-chave-aleatoria-longa' }), ErroConfiguracao);
  const ok = lerConfig({ ...BASE, ORGANIZER_EMAIL: 'A@B.pt' });
  assert.equal(ok.organizerEmail, 'a@b.pt');
  assert.equal(ok.databaseUrl, ''); // sem DATABASE_URL: SQLite local
});

test('com DATABASE_URL (Postgres) o SECRET_KEY passa a ser obrigatório', () => {
  const url = 'postgresql://postgres.ref:abc123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';
  assert.throws(() => lerConfig({ ...BASE, DATABASE_URL: url }), /SECRET_KEY/);
  const ok = lerConfig({ ...BASE, DATABASE_URL: url, SECRET_KEY: 'x'.repeat(40) });
  assert.equal(ok.databaseUrl, url);
});

test('a ligação direta do Supabase (só IPv6) é recusada com uma dica', () => {
  assert.throws(
    () => validarDatabaseUrl('postgresql://postgres:abc@db.xyz.supabase.co:5432/postgres'),
    /Session pooler/
  );
});

test('[YOUR-PASSWORD] colado com os parênteses é detetado', () => {
  assert.throws(
    () => validarDatabaseUrl('postgresql://postgres.ref:[abc]@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'),
    /parênteses retos/
  );
});

test('URL do pooler correto passa; utilizador "postgres" simples no pooler é recusado', () => {
  validarDatabaseUrl('postgresql://postgres.ref:abc123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres');
  assert.throws(
    () => validarDatabaseUrl('postgresql://postgres:abc123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'),
    /postgres\.<ref-do-projeto>/
  );
  assert.throws(() => validarDatabaseUrl('mysql://x'), /postgresql:\/\//);
});

test('os erros de ligação ao Postgres dão uma dica e nunca mostram o URL', () => {
  const e1 = explicarErroLigacao(new Error('password authentication failed for user "postgres.ref"'));
  assert.match(e1, /Reset database password/);
  const e2 = Object.assign(new Error('connect ENETUNREACH 2600:1f18::1:5432'), { code: 'ENETUNREACH' });
  assert.match(explicarErroLigacao(e2), /Session pooler/);
  assert.match(explicarErroLigacao(new Error('Tenant or user not found')), /postgres\.<ref-do-projeto>/);
  assert.match(explicarErroLigacao(new Error('timeout expired')), /tempo limite/);
});

test('os dois códigos de "email duplicado" (SQLite e Postgres) são reconhecidos', () => {
  assert.equal(emailDuplicado({ code: 'SQLITE_CONSTRAINT_UNIQUE' }), true);
  assert.equal(emailDuplicado({ code: '23505' }), true);
  assert.equal(emailDuplicado({ code: 'outro' }), false);
  assert.equal(emailDuplicado(null), false);
});

test('as datas aparecem na hora de Lisboa (inverno UTC+0, verão UTC+1)', () => {
  assert.equal(datahora('2027-01-15T12:00:00+00:00'), '15/01/2027 12:00');
  assert.equal(datahora('2027-07-15T12:00:00+00:00'), '15/07/2027 13:00');
});

test('a validação normaliza espaços e rejeita valores que não são texto', () => {
  const { valores, erros } = validarRegisto({ nome: '  Ana   Maria  ', email: ' ANA@Example.com ' });
  assert.deepEqual(erros, {});
  assert.deepEqual(valores, { nome: 'Ana Maria', email: 'ana@example.com' });
  assert.ok(validarRegisto({ nome: ['a', 'b'], email: { x: 1 } }).erros.nome);
  assert.ok(validarRegisto({ nome: 'x'.repeat(101), email: 'a@b.pt' }).erros.nome);
});
