'use strict';

const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');

const { RAIZ } = require('./config');
const { emailDuplicado } = require('./db');
const { gerarHash, verificarPassword } = require('./seguranca');
const { texto, validarRegisto } = require('./validacao');
const { datahora } = require('./formatar');
const EVENTO = require('./evento');

/**
 * Cria a aplicação Express. Recebe a configuração (ver config.js) e a base de dados
 * (ver db.js) em vez de as ler do ambiente, o que permite criar várias instâncias nos testes.
 */
function criarApp(config, bd) {
  const agora = config.agora || Date.now; // relógio (substituível nos testes)
  // A password do organizador nunca é guardada em claro: só o hash (calculado no arranque;
  // é uma Promise, por isso usa-se com await).
  const hashOrganizador = gerarHash(config.organizerPassword);

  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(RAIZ, 'views'));
  app.locals.evento = EVENTO;
  app.locals.datahora = (valor) => datahora(valor, config.fuso);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(express.static(path.join(RAIZ, 'public')));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    cookieSession({
      name: 'sessao',
      keys: [config.secretKey],
      maxAge: config.sessaoMs,
      httpOnly: true,
      sameSite: 'lax',
    })
  );

  /** Só deixa passar o organizador com sessão válida (e com atividade nos últimos 30 minutos). */
  function soOrganizador(req, res, next) {
    const instante = agora();
    const s = req.session;
    // O prazo é verificado no servidor (e não só pelo cookie do navegador).
    if (s && s.organizador === true && instante - s.ultimaAtividade < config.sessaoMs) {
      s.ultimaAtividade = instante; // renova o prazo a cada pedido
      res.set('Cache-Control', 'no-store'); // os dados não ficam em cache depois de sair
      return next();
    }
    req.session = null;
    return res.redirect('/organizador/login');
  }

  // --- Páginas públicas ---------------------------------------------------------
  app.get('/', (req, res) => res.render('index'));

  app.get('/registo', (req, res) => res.render('registo', { erros: {}, valores: {} }));

  app.post('/registo', async (req, res) => {
    const { valores, erros } = validarRegisto(req.body);
    if (Object.keys(erros).length > 0) {
      return res.status(400).render('registo', { erros, valores });
    }
    try {
      const id = await bd.inserirRegisto(valores.nome, valores.email, new Date().toISOString());
      req.session.ultimoRegisto = id;
      return res.redirect('/confirmacao');
    } catch (erro) {
      if (emailDuplicado(erro)) {
        return res
          .status(409)
          .render('registo', { erros: { email: 'Este email já está registado neste evento.' }, valores });
      }
      throw erro;
    }
  });

  app.get('/confirmacao', async (req, res) => {
    const id = req.session && req.session.ultimoRegisto;
    const reg = id ? await bd.obterRegisto(id) : undefined;
    if (!reg) return res.redirect('/');
    return res.render('confirmacao', { reg });
  });

  // Verificação de saúde: confirma que a base de dados responde.
  app.get('/saude', async (req, res) => {
    try {
      await bd.ping();
      res.type('text/plain').send('ok');
    } catch {
      res.status(503).type('text/plain').send('erro');
    }
  });

  // --- Organizador ----------------------------------------------------------------
  app.get('/organizador/login', (req, res) => res.render('login', { erro: null, email: '' }));

  app.post('/organizador/login', async (req, res) => {
    const email = texto(req.body.email).trim().toLowerCase();
    const password = texto(req.body.password);
    // Verifica sempre a password, para a resposta não revelar se o email existe.
    const passwordCorreta = await verificarPassword(password, await hashOrganizador);
    if (email === config.organizerEmail && passwordCorreta) {
      req.session = { organizador: true, ultimaAtividade: agora() };
      return res.redirect('/organizador');
    }
    return res.status(401).render('login', { erro: 'Email ou password incorretos.', email });
  });

  app.get('/organizador', soOrganizador, async (req, res) => {
    const linhas = await bd.listarRegistos();
    res.render('organizador', { linhas, total: linhas.length });
  });

  app.post('/organizador/sair', (req, res) => {
    req.session = null;
    res.redirect('/');
  });

  // --- Erros ----------------------------------------------------------------------
  app.use((req, res) => {
    res.status(404).render('erro', { codigo: 404, mensagem: 'Página não encontrada.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((erro, req, res, next) => {
    const codigo = erro.status || 500;
    if (codigo >= 500) console.error(erro);
    res.status(codigo).render('erro', {
      codigo,
      mensagem: codigo >= 500 ? 'Ocorreu um erro no servidor.' : 'Pedido inválido.',
    });
  });

  return app;
}

module.exports = { criarApp };
