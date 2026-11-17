# Registo de Evento (Flask + SQLite/Postgres + Docker)

Aplicação simples para registo num único evento (*Workshop de Desenvolvimento Web 2027*), com área de organizador protegida por login.

## Identificação do grupo

| Nome | Número de estudante |
|------|---------------------|
| Alaor Neto | 30014580 |
| Sérgio Jorge | 30014515 |

- **Aplicação online:** <https://project-event-registration-application.onrender.com> (ver [Publicação online](#publicação-online-render--supabase))
- **Relatório final (PDF):** [docs/relatorio.pdf](docs/relatorio.pdf)

## Estrutura

- `main.py` – servidor Flask (rotas, validação, base de dados, login). Usa SQLite local ou Postgres (se existir `DATABASE_URL`)
- `templates/` – páginas HTML (Bootstrap 5 + template Registration 6, carregados por CDN, é preciso internet para o estilo)
- `requirements.txt` – dependências Python
- `.env.example` – exemplo de configuração (com *placeholders*)
- `Dockerfile` – imagem da aplicação (python:3.12 + gunicorn)
- `tests.py` – testes dos 7 casos obrigatórios + 6 extras (`python tests.py`)

## Configuração

A aplicação lê a configuração de variáveis de ambiente. Crie o ficheiro `.env` a partir do exemplo:

```bash
cp .env.example .env        # Windows (PowerShell): Copy-Item .env.example .env
```

Depois edite o `.env` e defina:

| Variável | Para que serve |
|----------|----------------|
| `ORGANIZER_EMAIL` | email de login do organizador (obrigatória) |
| `ORGANIZER_PASSWORD` | password do organizador (obrigatória; nunca é guardada em claro, a aplicação só mantém o hash) |
| `SECRET_KEY` | chave que assina as sessões (gerar com `python -c "import secrets; print(secrets.token_hex(32))"`); obrigatória quando se usa `DATABASE_URL` |
| `DATABASE_URL` | opcional: ligação a Postgres (Supabase). Sem ela, a aplicação usa SQLite local |

Não existe nenhuma password por omissão no código: **se `ORGANIZER_EMAIL` ou `ORGANIZER_PASSWORD` faltarem, ou se mantiver os valores de exemplo do `.env.example`, a aplicação recusa arrancar** e mostra uma mensagem de erro (em Docker, ver `docker logs container-registo`).

O ficheiro `.env` está no `.gitignore` e não deve ser enviado para o GitHub.

## Conta de teste do organizador

Existe **uma conta de organizador**, definida pelo `.env` (não há registo de novos organizadores). Conta de teste fictícia, só para uso local:

| Campo | Valor |
|-------|-------|
| Email | `organizador@example.com` |
| Password | `Teste-Organizador-2027` |

Para a usar, ponha estes valores em `ORGANIZER_EMAIL` e `ORGANIZER_PASSWORD` no `.env`, arranque a aplicação (abaixo) e inicie sessão em `/organizador/login`.
Se mudar a password no `.env`, é preciso reiniciar a aplicação (o hash é calculado no arranque).

## Executar com Docker

Na pasta do projeto (onde está o `Dockerfile` e o `.env`):

```bash
# 1. Construir a imagem
docker build -t registo-evento:v1 .

# 2. Criar o contentor (variáveis do .env + volume para guardar a base de dados)
docker run -d --name container-registo -p 5003:5000 -v registo-dados:/data --env-file .env registo-evento:v1
```

Abrir http://localhost:5003 · Organizador: http://localhost:5003/organizador/login

Comandos úteis: `docker ps`, `docker logs container-registo`, `docker stop container-registo`, `docker start container-registo`.

Os registos ficam no volume `registo-dados` (`/data/registos.db`), por isso persistem mesmo depois de parar ou remover o contentor.

### Verificar a persistência

```bash
docker stop container-registo && docker start container-registo      # reiniciar
docker rm -f container-registo                                        # apagar o contentor...
docker run -d --name container-registo -p 5003:5000 -v registo-dados:/data --env-file .env registo-evento:v1   # ...e criar outro com o mesmo volume
```

Os registos continuam visíveis na página do organizador. Para apagar também os dados: `docker volume rm registo-dados`.

## Executar sem Docker (opcional)

Requer Python 3.12 ou superior.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows (PowerShell): .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# carregar as variáveis do .env
set -a; source .env; set +a        # Windows (PowerShell): defina-as com $env:ORGANIZER_EMAIL="..." etc.

python main.py                     # http://localhost:5000
```

A base de dados fica em `data/registos.db` (pasta criada automaticamente, ignorada pelo Git).

## Testes

Os 7 testes obrigatórios (registo válido, campos inválidos, email repetido, mesmo nome com email diferente, organizador com tabela e total, acesso negado sem login, persistência), mais seis testes extra (a aplicação não arranca sem password; `/saude` responde; validação do `DATABASE_URL` do Supabase; hora de Lisboa):

```bash
pip install -r requirements.txt
python tests.py
```

Os testes usam uma base de dados SQLite temporária e ignoram o `DATABASE_URL`, por isso nunca afetam os dados reais.

## Publicação online (Render + Supabase)

Arquitetura: **browser → Render (Flask/gunicorn, Docker) → Supabase (Postgres)**. A base de dados é externa porque o sistema de ficheiros do Render gratuito é efémero (um SQLite local perder-se-ia a cada reinício).

1. **Supabase:** criar um projeto (região na Europa) e guardar a password da base de dados. Em *Connect*, copiar a ligação **Session pooler** (host `...pooler.supabase.com`, utilizador `postgres.<ref-do-projeto>`); **não** usar *Direct connection* (só IPv6, o Render não a alcança). Substituir `[YOUR-PASSWORD]` pela password **sem os parênteses**; de preferência uma password só com letras e números (se tiver caracteres especiais, têm de ir codificados no URL). A tabela é criada automaticamente no primeiro arranque.
2. **Render:** *New → Web Service*, ligar ao repositório do GitHub (deteta o `Dockerfile`), instância **Free**, e em *Environment* definir `ORGANIZER_EMAIL`, `ORGANIZER_PASSWORD` (forte), `SECRET_KEY` e `DATABASE_URL`. Em *Health Check Path* indicar `/saude`. Cada `git push` faz novo deploy.
3. **UptimeRobot (opcional):** monitor HTTP em `https://<serviço>.onrender.com/saude` a cada 5 minutos, para o serviço gratuito não adormecer (sem tráfego durante 15 minutos suspende e demora cerca de 1 minuto a acordar).

Notas: nunca colocar `DATABASE_URL` nem passwords no GitHub; usar só dados fictícios; o serviço gratuito pode reiniciar a qualquer momento (os dados ficam no Supabase). Se o serviço online falhar, a versão local por Docker (secção acima) continua a funcionar sem `DATABASE_URL`.

### Verificar a persistência online

No Render: *Manual Deploy → Restart service* (ou *Suspend* e *Resume*). Depois de arrancar, os registos continuam visíveis em `/organizador`.

## Problemas comuns (deploy)

| Erro no log do Render | Causa e solução |
|-----------------------|-----------------|
| `Network is unreachable` (endereço IPv6) | `DATABASE_URL` é a *Direct connection*. Usar a **Session pooler**. |
| `password authentication failed` | Password errada ou com `[ ]` / caracteres especiais. *Reset database password* no Supabase (só letras e números) e atualizar o `DATABASE_URL` no Render. |
| `Tenant or user not found` | No pooler o utilizador é `postgres.<ref-do-projeto>`, não `postgres`. |
| `Erro de configuração: defina a variável ...` | Falta `ORGANIZER_EMAIL`, `ORGANIZER_PASSWORD` ou `SECRET_KEY` em *Environment*. |

Depois de alterar variáveis no Render, o serviço volta a fazer deploy sozinho; se não, *Manual Deploy → Deploy latest commit*.
