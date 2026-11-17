FROM python:3.12-slim

<<<<<<< HEAD
WORKDIR /app
=======
COPY requirements.txt /requirements.txt
RUN pip install --no-cache-dir -r /requirements.txt
>>>>>>> 1638a011b0d4cb94aff03f680a9622fa436b368d

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY templates templates

# Só usado quando NÃO há DATABASE_URL (SQLite local, com volume em /data).
ENV DATABASE_PATH=/data/registos.db

# O Render define PORT (10000); localmente usa 5000, como no README.
# 1 worker + threads: evita corridas ao criar a tabela no arranque.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 60 main:app"]
