'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const RAIZ = path.join(__dirname, '..');

// Valores de exemplo do .env.example: são públicos, por isso a aplicação recusa-os.
const PLACEHOLDERS = new Set([
  'troca-esta-password',
  'mudar-esta-password',
  'troca-por-uma-chave-aleatoria-longa',
]);

class ErroConfiguracao extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroConfiguracao';
  }
}

/** Carrega o ficheiro .env (se existir). Variáveis já definidas no ambiente não são alteradas. */
function carregarEnv() {
  const ficheiro = path.join(RAIZ, '.env');
  if (fs.existsSync(ficheiro)) process.loadEnvFile(ficheiro);
}

function variavelObrigatoria(env, nome) {
  const valor = (env[nome] || '').trim();
  if (!valor || PLACEHOLDERS.has(valor)) {
    throw new ErroConfiguracao(
      `Erro de configuração: defina a variável ${nome} com um valor real ` +
        '(copie .env.example para .env e edite-o; ver README).'
    );
  }
  return valor;
}

/** Recusa URLs de Postgres com erros comuns, com uma mensagem a dizer como corrigir. */
function validarDatabaseUrl(url) {
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new ErroConfiguracao('Erro de configuração: DATABASE_URL tem de começar por postgresql://');
  }
  const resto = url.split('://')[1];
  const arroba = resto.lastIndexOf('@');
  const credenciais = arroba >= 0 ? resto.slice(0, arroba) : '';
  const destino = arroba >= 0 ? resto.slice(arroba + 1) : resto;
  const doisPontos = credenciais.indexOf(':');
  const utilizador = doisPontos >= 0 ? credenciais.slice(0, doisPontos) : credenciais;
  const password = doisPontos >= 0 ? credenciais.slice(doisPontos + 1) : '';
  const host = destino.split(/[:/?#]/)[0];

  if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
    throw new ErroConfiguracao(
      'Erro de configuração: DATABASE_URL é a ligação direta do Supabase (só IPv6; o Render não a alcança). ' +
        'No Supabase use Connect > Session pooler (host ...pooler.supabase.com).'
    );
  }
  if (/[[\]]/.test(password) || utilizador.includes('[')) {
    throw new ErroConfiguracao(
      'Erro de configuração: DATABASE_URL contém parênteses retos [ ]. Em [YOUR-PASSWORD] os parênteses ' +
        'são só um marcador: substitua-o por inteiro pela password, sem [ ].'
    );
  }
  if (host.endsWith('.pooler.supabase.com') && !utilizador.includes('.')) {
    throw new ErroConfiguracao(
      'Erro de configuração: no Session pooler o utilizador tem de ser postgres.<ref-do-projeto> ' +
        "(não apenas 'postgres'). Copie o URL de Connect > Session pooler."
    );
  }
}

/** Lê e valida a configuração a partir das variáveis de ambiente. */
function lerConfig(env = process.env) {
  const organizerEmail = variavelObrigatoria(env, 'ORGANIZER_EMAIL').toLowerCase();
  const organizerPassword = variavelObrigatoria(env, 'ORGANIZER_PASSWORD');

  // Com DATABASE_URL (Postgres, ex.: Supabase) usa Postgres; sem ela usa SQLite local.
  const databaseUrl = (env.DATABASE_URL || '').trim();
  if (databaseUrl) validarDatabaseUrl(databaseUrl);

  // Sem SECRET_KEY gera-se uma chave aleatória (as sessões acabam ao reiniciar).
  let secretKey = (env.SECRET_KEY || '').trim();
  if (PLACEHOLDERS.has(secretKey)) {
    throw new ErroConfiguracao(
      'Erro de configuração: troque o SECRET_KEY de exemplo por uma chave aleatória (ver .env.example).'
    );
  }
  // Online o serviço reinicia: sem chave fixa, o organizador perdia a sessão a cada reinício.
  if (databaseUrl) secretKey = variavelObrigatoria(env, 'SECRET_KEY');
  if (!secretKey) secretKey = randomBytes(32).toString('hex');

  const fuso = (env.TIMEZONE || 'Europe/Lisbon').trim();
  try {
    new Intl.DateTimeFormat('pt-PT', { timeZone: fuso });
  } catch {
    throw new ErroConfiguracao(`Erro de configuração: TIMEZONE inválido (${fuso}).`);
  }

  return {
    organizerEmail,
    organizerPassword,
    secretKey,
    fuso,
    porta: Number(env.PORT) || 3000,
    databaseUrl, // vazio = SQLite local
    dbPath: path.resolve(env.DATABASE_PATH || path.join(RAIZ, 'data', 'registos.db')),
    sessaoMs: 30 * 60 * 1000, // o login do organizador expira após 30 minutos sem atividade
  };
}

module.exports = { RAIZ, ErroConfiguracao, carregarEnv, lerConfig, validarDatabaseUrl };
