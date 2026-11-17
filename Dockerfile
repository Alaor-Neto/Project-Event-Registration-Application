FROM python:3.12

RUN pip install flask

COPY main.py /main.py
COPY templates /templates

ENV DATABASE_PATH=/data/registos.db

CMD ["python", "/main.py"]
