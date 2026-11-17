FROM python:3.12

COPY requirements.txt /requirements.txt
RUN pip install --no-cache-dir -r /requirements.txt

COPY main.py /main.py
COPY templates /templates

ENV DATABASE_PATH=/data/registos.db

CMD ["python", "/main.py"]
