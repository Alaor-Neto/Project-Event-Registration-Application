FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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
