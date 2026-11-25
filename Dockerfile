# --- Fase 1: instalar as dependências -----------------------------------------------
# O better-sqlite3 é um módulo nativo. Quando não existe binário pronto para esta versão do
# Node, o npm compila-o, e para isso precisa de Python, make e g++ (que a imagem "slim" não tem).
# Estas ferramentas ficam só nesta fase e não vão para a imagem final.
FROM node:22-slim AS dependencias

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Fase 2: imagem final (leve, sem ferramentas de compilação) ----------------------
FROM node:22-slim

WORKDIR /app

COPY --from=dependencias /app/node_modules node_modules
COPY package.json package-lock.json ./
COPY server.js ./
COPY src src
COPY views views
COPY public public

# Só usado quando NÃO há DATABASE_URL (SQLite local, com volume em /data).
ENV NODE_ENV=production \
    DATABASE_PATH=/data/registos.db
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 5000
# O Render define PORT (10000); localmente usa 5000, como no README.
CMD ["sh", "-c", "PORT=${PORT:-5000} exec node server.js"]
