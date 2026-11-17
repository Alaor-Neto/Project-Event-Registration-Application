import os
import re
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from secrets import token_hex

from flask import Flask, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

# --- Configuração -------------------------------------------------------------
DB = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "registos.db"),
)
ORGANIZER_EMAIL = os.environ.get("ORGANIZER_EMAIL", "organizador@example.com").lower()
# A password nunca é guardada em claro: guardamos apenas o hash.
ORGANIZER_HASH = generate_password_hash(
    os.environ.get("ORGANIZER_PASSWORD", "mudar-esta-password")
)

EVENTO = {
    "nome": "Workshop de Desenvolvimento Web 2027",
    "descricao": "Um workshop prático de um dia onde vamos construir uma aplicação "
                 "web completa, do navegador à base de dados. Aberto a todos os estudantes.",
    "data": "15 de fevereiro de 2027, 10:00 – 17:00",
    "local": "Anfiteatro 2, Edifício Principal da Universidade",
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


# --- Base de dados (SQLite) ----------------------------------------------------
def ligar():
    ligacao = sqlite3.connect(DB)
    ligacao.row_factory = sqlite3.Row
    return ligacao


def criar_tabela():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    with ligar() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS registos (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   nome TEXT NOT NULL,
                   email TEXT NOT NULL UNIQUE,
                   data_registo TEXT NOT NULL
               )"""
        )


criar_tabela()


@app.context_processor
def dados_evento():
    return {"evento": EVENTO}


@app.template_filter("datahora")
def datahora(valor):
    return datetime.fromisoformat(valor).astimezone().strftime("%d/%m/%Y %H:%M")


def so_organizador(funcao):
    @wraps(funcao)
    def verificar(*args, **kwargs):
        if not session.get("organizador"):
            return redirect(url_for("login"))
        return funcao(*args, **kwargs)
    return verificar


# --- Páginas públicas ----------------------------------------------------------
@app.get("/")
def inicio():
    return render_template("index.html")


@app.route("/registo", methods=["GET", "POST"])
def registo():
    if request.method == "GET":
        return render_template("registo.html", erros={}, valores={})

    nome = " ".join(request.form.get("nome", "").split())
    email = request.form.get("email", "").strip().lower()

    erros = {}
    if not nome:
        erros["nome"] = "O nome é obrigatório."
    elif len(nome) > 100:
        erros["nome"] = "O nome deve ter no máximo 100 caracteres."
    if not email:
        erros["email"] = "O email é obrigatório."
    elif len(email) > 254 or not EMAIL_RE.match(email):
        erros["email"] = "Introduza um email válido (ex.: nome@exemplo.com)."
    if erros:
        return render_template("registo.html", erros=erros, valores={"nome": nome, "email": email}), 400

    try:
        with ligar() as db:
            cur = db.execute(
                "INSERT INTO registos (nome, email, data_registo) VALUES (?, ?, ?)",
                (nome, email, datetime.now(timezone.utc).isoformat()),
            )
    except sqlite3.IntegrityError:  # email repetido (UNIQUE)
        erros["email"] = "Este email já está registado neste evento."
        return render_template("registo.html", erros=erros, valores={"nome": nome, "email": email}), 409

    session["ultimo_registo"] = cur.lastrowid
    return redirect(url_for("confirmacao"))


@app.get("/confirmacao")
def confirmacao():
    id_registo = session.get("ultimo_registo")
    if not id_registo:
        return redirect(url_for("inicio"))
    with ligar() as db:
        reg = db.execute("SELECT * FROM registos WHERE id = ?", (id_registo,)).fetchone()
    if reg is None:
        return redirect(url_for("inicio"))
    return render_template("confirmacao.html", reg=reg)


# --- Organizador -----------------------------------------------------------------
@app.route("/organizador/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if email == ORGANIZER_EMAIL and check_password_hash(ORGANIZER_HASH, password):
            session.clear()
            session["organizador"] = True
            return redirect(url_for("organizador"))
        return render_template("login.html", erro="Email ou password incorretos.", email=email), 401
    return render_template("login.html", erro=None, email="")


@app.get("/organizador")
@so_organizador
def organizador():
    with ligar() as db:
        linhas = db.execute("SELECT * FROM registos ORDER BY id DESC").fetchall()
    return render_template("organizador.html", linhas=linhas, total=len(linhas))


@app.post("/organizador/sair")
def sair():
    session.clear()
    return redirect(url_for("inicio"))


if __name__ == "__main__":
    app.run(host="0.0.0.0")
