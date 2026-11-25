'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ErroConfiguracao } = require('./config');

const TABELA_RE = /^[a-z_][a-z0-9_]*$/;
const CODIGOS_DUPLICADO = new Set(['SQLITE_CONSTRAINT_UNIQUE', '23505']); // SQLite, Postgres

/**
 * Abre a base de dados: Postgres (ex.: Supabase) se existir config.databaseUrl,
 * senão SQLite local. As duas devolvem a mesma interface (todas as funções são assíncronas).
 * config.tabela (opcional) permite aos testes usar uma tabela própria.
 */
async function abrirBaseDeDados(config) {
  const tabela = config.tabela || 'registos';
  if (!TABELA_RE.test(tabela)) throw new Error(`Nome de tabela inválido: ${tabela}`);
  return config.databaseUrl
    ? abrirPostgres(config.databaseUrl, tabela)
    : abrirSqlite(config.dbPath, tabela);
}

// --- SQLite ------------------------------------------------------------------------
function abrirSqlite(caminho, tabela) {
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new Database(caminho);

  db.exec(`CREATE TABLE IF NOT EXISTS ${tabela} (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             nome TEXT NOT NULL,
             email TEXT NOT NULL UNIQUE,
             data_registo TEXT NOT NULL
           )`);

  const inserir = db.prepare(`INSERT INTO ${tabela} (nome, email, data_registo) VALUES (?, ?, ?)`);
  const porId = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`);
  const todos = db.prepare(`SELECT * FROM ${tabela} ORDER BY id DESC`);
  const contar = db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`);

  return {
    tipo: 'sqlite',
    inserirRegisto: async (nome, email, dataRegisto) => Number(inserir.run(nome, email, dataRegisto).lastInsertRowid),
    obterRegisto: async (id) => porId.get(id),
    listarRegistos: async () => todos.all(),
    contarRegistos: async () => contar.get().n,
    ping: async () => db.prepare('SELECT 1').get(),
    fechar: async () => db.close(),
  };
}

// --- Postgres (Supabase) --------------------------------------------------------------
async function abrirPostgres(url, tabela) {
  const { Pool } = require('pg');

  // O Supabase usa um certificado que o Node não reconhece por omissão; ligamos com SSL sem
  // verificar a cadeia (a ligação continua cifrada). O "sslmode" do URL é retirado porque
  // o pg o interpretaria como verificação total e recusaria a ligação.
  const urlSemSsl = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
  const host = (url.split('@').pop() || '').split(/[:/?#]/)[0];
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);

  const pool = new Pool({
    connectionString: urlSemSsl,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  // Ligações inativas que caiam (o Supabase fecha-as) não devem derrubar a aplicação.
  pool.on('error', (erro) => console.error('Erro numa ligação inativa à base de dados:', erro.message));

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tabela} (
                        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        nome TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE,
                        data_registo TEXT NOT NULL
                      )`);
  } catch (erro) {
    await pool.end().catch(() => {});
    throw new ErroConfiguracao(explicarErroLigacao(erro));
  }

  // O Postgres devolve BIGINT como texto: convertemos o id para número.
  const comId = (linha) => (linha ? { ...linha, id: Number(linha.id) } : undefined);

  return {
    tipo: 'postgres',
    inserirRegisto: async (nome, email, dataRegisto) => {
      const r = await pool.query(
        `INSERT INTO ${tabela} (nome, email, data_registo) VALUES ($1, $2, $3) RETURNING id`,
        [nome, email, dataRegisto]
      );
      return Number(r.rows[0].id);
    },
    obterRegisto: async (id) => comId((await pool.query(`SELECT * FROM ${tabela} WHERE id = $1`, [id])).rows[0]),
    listarRegistos: async () => (await pool.query(`SELECT * FROM ${tabela} ORDER BY id DESC`)).rows.map(comId),
    contarRegistos: async () => Number((await pool.query(`SELECT COUNT(*) AS n FROM ${tabela}`)).rows[0].n),
    ping: async () => pool.query('SELECT 1'),
    fechar: async () => pool.end(),
  };
}

/** Traduz o erro do Postgres numa dica prática (nunca mostra o DATABASE_URL nem a password). */
function explicarErroLigacao(erro) {
  const texto = `${erro.code || ''} ${erro.message || ''}`;
  const primeira = (erro.message || String(erro)).trim().split('\n')[0];
  let dica;
  if (texto.includes('password authentication failed')) {
    dica =
      'A password do DATABASE_URL está errada. Faça Reset database password no Supabase ' +
      '(Project Settings > Database), use uma só com letras e números e cole-a no URL sem [ ].';
  } else if (texto.includes('ENETUNREACH') || texto.includes('Network is unreachable')) {
    dica = 'O Render não alcança este host (IPv6). Use a Session pooler do Supabase, não a ligação direta.';
  } else if (/tenant\/user .* not found|Tenant or user not found/i.test(texto)) {
    // Mensagem do pooler do Supabase (Supavisor). Quase nunca é a password: é o host ou o utilizador.
    dica =
      'O pooler do Supabase não encontrou este projeto. Quase sempre o host do DATABASE_URL não é o do ' +
      'seu projeto (região ou número aws-0/aws-1 diferentes) ou o utilizador não é postgres.<ref-do-projeto>. ' +
      'Não componha o host à mão: no Supabase abra Connect > Session pooler, copie o URL completo e ' +
      'troque só [YOUR-PASSWORD]. Confirme também que o projeto não está pausado.';
  } else if (texto.includes('ENOTFOUND')) {
    dica = 'O host do DATABASE_URL não existe: confirme o URL copiado de Connect > Session pooler.';
  } else if (/timeout|ETIMEDOUT/i.test(texto)) {
    dica =
      'A ligação excedeu o tempo limite: confirme o host/porta e que o projeto Supabase não está pausado.';
  } else {
    dica = 'Confirme o DATABASE_URL no Render (Environment) e que o projeto Supabase está ativo.';
  }
  return `Erro ao ligar à base de dados: ${primeira}\n${dica}`;
}

function emailDuplicado(erro) {
  return Boolean(erro) && CODIGOS_DUPLICADO.has(erro.code);
}

module.exports = { abrirBaseDeDados, emailDuplicado, explicarErroLigacao };
