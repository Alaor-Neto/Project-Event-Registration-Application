# Registo de Evento (Node.js + Express + SQLite)

Aplicação simples para registo num único evento (*Workshop de Desenvolvimento Web 2027*), com área de organizador protegida por login.

## Identificação do grupo

| Nome | Número de estudante |
|------|---------------------|
| Alaor Neto | 30014580 |
| Sérgio Jorge | 30014515 |

- **Aplicação online:** <https://ENDERECO-DO-SERVICO.onrender.com> (ver [Publicação online](#publicação-online-render--supabase)) <!-- atualizar -->
- **Relatório final (PDF):** [docs/relatorio.pdf](docs/relatorio.pdf)
- **Versão submetida:** tag `vX.Y` (commit `XXXXXXX`) <!-- atualizar antes de submeter -->

## Tecnologias

- **Servidor:** Node.js + [Express](https://expressjs.com/) (JavaScript)
- **Base de dados:** **SQLite** local (por omissão, através de [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) ou **Postgres** (Supabase, através de [pg](https://node-postgres.com/)) quando existe `DATABASE_URL`
- **Páginas:** templates [EJS](https://ejs.co/) (HTML renderizado no servidor) + Bootstrap 5, carregado por CDN (é preciso internet para o estilo)
- **Navegador:** JavaScript em `public/js/` (validação do formulário de registo e botão de mostrar/ocultar a password)
- **Login:** sessão num cookie assinado (`cookie-session`); a password é guardada só como hash (`scrypt`, do módulo `crypto` do Node)

## Estrutura

```
server.js            arranque (lê a configuração, abre a porta)
src/app.js           rotas, sessões e proteção da área do organizador
src/config.js        leitura e validação das variáveis de ambiente
src/db.js            base de dados: SQLite ou Postgres (tabela e consultas)
src/validacao.js     validação do nome e do email (no servidor)
src/seguranca.js     hash e verificação da password
src/formatar.js      datas na hora de Lisboa
src/evento.js        dados do evento
views/               páginas EJS
public/js/           JavaScript do navegador
tests/               testes (`npm test`)
```

## Configuração

Requer **Node.js 20.12 ou superior** (recomendado: 22 LTS). Instalar as dependências:

```bash
npm install
```

A aplicação lê a configuração de variáveis de ambiente. Crie o ficheiro `.env` a partir do exemplo:

```bash
cp .env.example .env        # Windows (PowerShell): Copy-Item .env.example .env
```

Depois edite o `.env` e defina:

| Variável | Para que serve |
|----------|----------------|
| `ORGANIZER_EMAIL` | email de login do organizador (obrigatória) |
| `ORGANIZER_PASSWORD` | password do organizador (obrigatória; nunca é guardada em claro, a aplicação só mantém o hash) |
| `SECRET_KEY` | chave que assina as sessões (gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Opcional: sem ela, gera-se uma chave aleatória e o login acaba ao reiniciar |
| `PORT` | opcional: porta do servidor (por omissão, 3000; o Render define-a sozinho) |
| `DATABASE_PATH` | opcional: ficheiro SQLite (por omissão, `data/registos.db`) |
| `DATABASE_URL` | opcional: ligação a Postgres (Supabase). Sem ela, a aplicação usa SQLite local. Com ela, `SECRET_KEY` passa a ser obrigatória |

Não existe nenhuma password por omissão no código: **se `ORGANIZER_EMAIL` ou `ORGANIZER_PASSWORD` faltarem, ou se mantiver os valores de exemplo do `.env.example`, a aplicação recusa arrancar** e mostra uma mensagem de erro.

O ficheiro `.env` está no `.gitignore` e não deve ser enviado para o GitHub.

## Conta de teste do organizador

Existe **uma conta de organizador**, definida pelo `.env` (não há registo de novos organizadores). Conta de teste fictícia, só para uso local:

| Campo | Valor |
|-------|-------|
| Email | `organizador@example.com` |
| Password | `Teste-Organizador-2027` |

Para a usar, ponha estes valores em `ORGANIZER_EMAIL` e `ORGANIZER_PASSWORD` no `.env`, arranque a aplicação (abaixo) e inicie sessão em `/organizador/login`. No campo da password há um botão (olho) para mostrar ou ocultar o que se escreve.
Se mudar a password no `.env`, é preciso reiniciar a aplicação (o hash é calculado no arranque).
A sessão do organizador expira após 30 minutos sem atividade (é preciso voltar a iniciar sessão).

## Executar

```bash
npm start
```

Abrir http://localhost:3000 · Organizador: http://localhost:3000/organizador/login

Sem `DATABASE_URL`, a base de dados fica em `data/registos.db` (pasta e tabela criadas automaticamente no primeiro arranque; ignoradas pelo Git). Não é preciso instalar nenhum servidor de base de dados.

## Executar com Docker (opcional)

Na pasta do projeto (onde está o `Dockerfile` e o `.env`):

```bash
# 1. Construir a imagem
docker build -t registo-evento:v2 .

# 2. Criar o contentor (variáveis do .env + volume para guardar a base de dados)
docker run -d --name container-registo -p 5003:5000 -v registo-dados:/data --env-file .env registo-evento:v2
```

Abrir http://localhost:5003 · Organizador: http://localhost:5003/organizador/login

Comandos úteis: `docker ps`, `docker logs container-registo`, `docker stop container-registo`, `docker start container-registo`.

Sem `DATABASE_URL` no `.env`, os registos ficam no volume `registo-dados` (`/data/registos.db`), por isso persistem mesmo depois de parar ou remover o contentor. Para apagar também os dados: `docker volume rm registo-dados`.

## Verificar a persistência

Registar um participante, parar a aplicação (Ctrl+C) e voltar a executar `npm start`: os registos continuam visíveis em `/organizador`. Com Docker: `docker stop container-registo && docker start container-registo` (ou apagar o contentor e criar outro com o mesmo volume).

## Testes

```bash
npm test
```

Os 7 testes obrigatórios (registo válido, campos inválidos, email repetido, mesmo nome com email diferente, organizador com tabela e total, acesso negado sem login, persistência após reiniciar), mais testes extra (registos simultâneos com o mesmo email, escape de HTML, injeção de SQL, expiração da sessão, cookie HttpOnly, `/saude`, botão da password, hash da password, validação do `DATABASE_URL`, hora de Lisboa, erro 404). Os testes usam bases de dados temporárias, por isso nunca afetam os dados reais.

Por omissão correm sobre **SQLite**. Para correr a mesma bateria também sobre **Postgres**, defina `TEST_DATABASE_URL` com uma base Postgres **de teste** (nunca a de produção; cada teste cria e apaga a sua própria tabela `registos_teste_...`):

```bash
TEST_DATABASE_URL=postgresql://utilizador:password@localhost:5432/base_de_teste npm test
# Windows (PowerShell): $env:TEST_DATABASE_URL="postgresql://..."; npm test
```

## Publicação online (Render + Supabase)

Arquitetura: **browser → Render (Node/Express, Docker) → Supabase (Postgres)**. A base de dados é externa porque o sistema de ficheiros do Render gratuito é efémero (um SQLite local perder-se-ia a cada reinício ou novo deploy).

1. **Supabase:** criar um projeto (região na Europa) e guardar a password da base de dados. Em *Connect*, copiar a ligação **Session pooler** (host `...pooler.supabase.com`, utilizador `postgres.<ref-do-projeto>`); **não** usar *Direct connection* (só IPv6, o Render não a alcança). Substituir `[YOUR-PASSWORD]` pela password **sem os parênteses**; de preferência uma password só com letras e números (se tiver caracteres especiais, têm de ir codificados no URL). A tabela é criada automaticamente no primeiro arranque.
2. **Render:** *New → Web Service*, ligar ao repositório do GitHub (deteta o `Dockerfile`), instância **Free**, e em *Environment* definir `ORGANIZER_EMAIL`, `ORGANIZER_PASSWORD` (forte), `SECRET_KEY` e `DATABASE_URL`. Em *Health Check Path* indicar `/saude`. Cada `git push` faz novo deploy.
3. **UptimeRobot (opcional):** monitor HTTP em `https://<serviço>.onrender.com/saude` a cada 5 minutos. O serviço gratuito do Render suspende-se após 15 minutos sem pedidos e demora cerca de 1 minuto a acordar.

Notas:
- Nunca colocar `DATABASE_URL` nem passwords no GitHub; usar só dados fictícios.
- O serviço gratuito pode reiniciar a qualquer momento (os dados ficam no Supabase).
- Os projetos gratuitos do Supabase podem ser pausados após um período sem atividade; se acontecer, é só retomar o projeto no painel do Supabase.
- Os dados do SQLite local **não passam** automaticamente para o Supabase: são bases separadas. Online começa-se com a tabela vazia.
- Se o serviço online falhar, a versão local (`npm start` ou Docker, sem `DATABASE_URL`) continua a funcionar.

### Verificar a persistência online

No Render: *Manual Deploy → Restart service* (ou *Suspend* e *Resume*). Depois de arrancar, os registos continuam visíveis em `/organizador`.

## Problemas comuns (deploy)

| Erro no log do Render | Causa e solução |
|-----------------------|-----------------|
| `ENETUNREACH` / `Network is unreachable` (endereço IPv6) | `DATABASE_URL` é a *Direct connection*. Usar a **Session pooler**. |
| `password authentication failed` | Password errada ou com `[ ]` / caracteres especiais. *Reset database password* no Supabase (só letras e números) e atualizar o `DATABASE_URL` no Render. |
| `Tenant or user not found` | No pooler o utilizador é `postgres.<ref-do-projeto>`, não `postgres`. |
| `ENOTFOUND` | O host do `DATABASE_URL` está errado: copiar de novo em *Connect → Session pooler*. |
| `Erro de configuração: defina a variável ...` | Falta `ORGANIZER_EMAIL`, `ORGANIZER_PASSWORD` ou `SECRET_KEY` em *Environment*. |

Depois de alterar variáveis no Render, o serviço volta a fazer deploy sozinho; se não, *Manual Deploy → Deploy latest commit*.
