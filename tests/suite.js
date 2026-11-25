'use strict';

/**
 * Bateria de testes partilhada pelas duas bases de dados (SQLite e Postgres).
 * Os testes 1–7 são os testes obrigatórios do enunciado.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { criarApp } = require('../src/app');
const { abrirBaseDeDados } = require('../src/db');

const ORG = { email: 'org@example.com', password: 'segredo123' };

/**
 * @param {string} rotulo  nome da base de dados nos resultados
 * @param {(t) => Promise<object>} novaConfigBd  devolve a configuração da base de dados
 *        (dbPath ou databaseUrl + tabela) de uma base limpa, só para este teste
 * @param {object} [opcoes]  opções do describe (ex.: skip)
 */
function registarTestes(rotulo, novaConfigBd, opcoes = {}) {
  async function configDeTeste(t, extra = {}) {
    return {
      organizerEmail: ORG.email,
      organizerPassword: ORG.password,
      secretKey: 'chave-de-teste-'.padEnd(64, 'x'),
      fuso: 'Europe/Lisbon',
      sessaoMs: 30 * 60 * 1000,
      ...(await novaConfigBd(t)),
      ...extra,
    };
  }

  async function iniciar(t, extra) {
    const config = await configDeTeste(t, extra);
    const bd = await abrirBaseDeDados(config);
    t.after(() => bd.fechar().catch(() => {})); // já fechada, no teste de persistência
    const app = criarApp(config, bd);
    return { config, app, bd, agente: request.agent(app) };
  }

  const entrar = (agente) =>
    agente.post('/organizador/login').type('form').send({ email: ORG.email, password: ORG.password });
  const registar = (agente, nome, email) => agente.post('/registo').type('form').send({ nome, email });

  describe(rotulo, opcoes, () => {
    test('1. Um registo válido é guardado e confirmado', async (t) => {
      const { agente, bd } = await iniciar(t);
      const r = await registar(agente, 'Ana Silva', 'ana@example.com');
      assert.equal(r.status, 302);
      assert.equal(r.headers.location, '/confirmacao');
      const pagina = await agente.get('/confirmacao');
      assert.equal(pagina.status, 200);
      assert.match(pagina.text, /Registo confirmado/);
      assert.match(pagina.text, /Ana Silva/);
      const guardado = await bd.listarRegistos();
      assert.equal(guardado.length, 1);
      assert.equal(typeof guardado[0].id, 'number');
      assert.ok(guardado[0].data_registo, 'tem data de registo');
    });

    test('2. Nome vazio ou email inválido são rejeitados', async (t) => {
      const { agente, bd } = await iniciar(t);
      const semNome = await registar(agente, '', 'a@example.com');
      assert.equal(semNome.status, 400);
      assert.match(semNome.text, /O nome é obrigatório/);
      assert.equal((await registar(agente, '   ', 'a@example.com')).status, 400);
      const emailMau = await registar(agente, 'Rui', 'invalido');
      assert.equal(emailMau.status, 400);
      assert.match(emailMau.text, /email válido/);
      assert.equal((await registar(agente, 'Rui', '')).status, 400);
      assert.equal(await bd.contarRegistos(), 0);
    });

    test('3. Um email repetido não cria um segundo registo', async (t) => {
      const { agente, bd } = await iniciar(t);
      await registar(agente, 'Bia', 'bia@example.com');
      const repetido = await registar(agente, 'Bia', 'BIA@example.com'); // maiúsculas: o mesmo email
      assert.equal(repetido.status, 409);
      assert.match(repetido.text, /já está registado/);
      assert.equal(await bd.contarRegistos(), 1);
    });

    test('4. O mesmo nome com email diferente é aceite', async (t) => {
      const { agente, bd } = await iniciar(t);
      assert.equal((await registar(agente, 'João Silva', 'j1@example.com')).status, 302);
      assert.equal((await registar(agente, 'João Silva', 'j2@example.com')).status, 302);
      assert.equal(await bd.contarRegistos(), 2);
    });

    test('5. O organizador faz login e vê a tabela e o total corretos', async (t) => {
      const { app, agente, bd } = await iniciar(t);
      await registar(request.agent(app), 'Carla', 'carla@example.com');
      await registar(request.agent(app), 'Diogo', 'diogo@example.com');

      const errada = await agente.post('/organizador/login').type('form').send({ email: ORG.email, password: 'errada' });
      assert.equal(errada.status, 401);
      const emailErrado = await agente
        .post('/organizador/login')
        .type('form')
        .send({ email: 'outro@example.com', password: ORG.password });
      assert.equal(emailErrado.status, 401);

      assert.equal((await entrar(agente)).status, 302);
      const pagina = await agente.get('/organizador');
      assert.equal(pagina.status, 200);
      assert.match(pagina.text, new RegExp(`id="total">${await bd.contarRegistos()}<`));
      assert.match(pagina.text, /id="total">2</);
      assert.match(pagina.text, /Carla/);
      assert.match(pagina.text, /diogo@example\.com/);
    });

    test('6. Sem login, o acesso aos dados do organizador é negado', async (t) => {
      const { agente } = await iniciar(t);
      const r = await agente.get('/organizador');
      assert.equal(r.status, 302);
      assert.equal(r.headers.location, '/organizador/login');
      assert.doesNotMatch(r.text, /Total de registos/);
    });

    test('7. Os registos continuam disponíveis depois de reiniciar a aplicação', async (t) => {
      const config = await configDeTeste(t);
      const bd1 = await abrirBaseDeDados(config);
      await registar(request.agent(criarApp(config, bd1)), 'Persist', 'p@example.com');
      await bd1.fechar(); // "reiniciar": fecha tudo e arranca outra instância sobre a mesma base de dados

      const bd2 = await abrirBaseDeDados(config);
      t.after(() => bd2.fechar());
      const agente = request.agent(criarApp(config, bd2));
      await entrar(agente);
      const pagina = await agente.get('/organizador');
      assert.match(pagina.text, /p@example\.com/);
      assert.match(pagina.text, /id="total">1</);
    });

    // --- Extras ------------------------------------------------------------------------
    test('Extra: dois registos simultâneos com o mesmo email: só um é guardado', async (t) => {
      const { app, bd } = await iniciar(t);
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () => registar(request.agent(app), 'Corrida', 'corrida@example.com'))
      );
      assert.equal(respostas.filter((r) => r.status === 302).length, 1);
      assert.equal(respostas.filter((r) => r.status === 409).length, 4);
      assert.equal(await bd.contarRegistos(), 1);
    });

    test('Extra: os dados são escapados no HTML (sem XSS)', async (t) => {
      const { app, agente } = await iniciar(t);
      await registar(request.agent(app), '<script>alert(1)</script>', 'xss@example.com');
      await entrar(agente);
      const pagina = await agente.get('/organizador');
      assert.doesNotMatch(pagina.text, /<script>alert\(1\)<\/script>/);
      assert.match(pagina.text, /&lt;script&gt;/);
    });

    test('Extra: injeção de SQL no email/nome não tem efeito', async (t) => {
      const { agente, bd } = await iniciar(t);
      await registar(agente, "x'); DROP TABLE registos;--", "o'brien@example.com");
      assert.equal(await bd.contarRegistos(), 1);
      assert.equal((await registar(agente, 'Outra', 'outra@example.com')).status, 302);
      assert.equal(await bd.contarRegistos(), 2);
    });

    test('Extra: a sessão do organizador expira após 30 minutos de inatividade (verificado no servidor)', async (t) => {
      let agora = Date.now();
      const { agente } = await iniciar(t, { agora: () => agora }); // relógio controlado pelo teste
      await entrar(agente);
      agora += 29 * 60 * 1000;
      assert.equal((await agente.get('/organizador')).status, 200); // ainda válida (e o prazo renova)
      agora += 29 * 60 * 1000;
      assert.equal((await agente.get('/organizador')).status, 200); // 58 min no total, mas só 29 sem atividade
      agora += 31 * 60 * 1000;
      assert.equal((await agente.get('/organizador')).status, 302); // 31 min sem atividade: expirou
    });

    test('Extra: o cookie de sessão não é legível por JavaScript (HttpOnly)', async (t) => {
      const { agente } = await iniciar(t);
      const r = await entrar(agente);
      assert.match(r.headers['set-cookie'].join(';'), /httponly/i);
    });

    test('Extra: /saude responde ok quando a base de dados está acessível', async (t) => {
      const { agente } = await iniciar(t);
      const r = await agente.get('/saude');
      assert.equal(r.status, 200);
      assert.equal(r.text, 'ok');
    });

    test('Extra: /saude devolve 503 quando a base de dados não responde', async (t) => {
      const { agente, bd } = await iniciar(t);
      await bd.fechar();
      assert.equal((await agente.get('/saude')).status, 503);
    });

    test('Extra: o botão de mostrar/ocultar password existe e o seu script é servido', async (t) => {
      const { agente } = await iniciar(t);
      const login = await agente.get('/organizador/login');
      assert.match(login.text, /id="alternar-password"/);
      assert.match(login.text, /src="\/js\/login\.js"/);
      const script = await agente.get('/js/login.js');
      assert.equal(script.status, 200);
      assert.match(script.headers['content-type'], /javascript/);
    });

    test('Extra: páginas inexistentes devolvem 404', async (t) => {
      const { agente } = await iniciar(t);
      assert.equal((await agente.get('/nao-existe')).status, 404);
    });
  });
}

module.exports = { registarTestes };
