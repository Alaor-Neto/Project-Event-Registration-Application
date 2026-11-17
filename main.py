import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import wraps
from secrets import token_hex
from zoneinfo import ZoneInfo

from flask import Flask, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

# --- Configuração -------------------------------------------------------------
DB = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "registos.db"),
)
# Com DATABASE_URL (Postgres, ex.: Supabase) usa Postgres; sem ela usa SQLite local.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USA_POSTGRES = bool(DATABASE_URL)


def validar_database_url(url):
    """Recusa URLs de Postgres com erros comuns, com uma mensagem a dizer como corrigir."""
    if not url.startswith(("postgresql://", "postgres://")):
        raise SystemExit("Erro de configuração: DATABASE_URL tem de começar por postgresql://")
    credenciais, _, destino = url.split("://", 1)[1].rpartition("@")
    utilizador, _, password = credenciais.partition(":")
    host = re.split(r"[:/?#]", destino, maxsplit=1)[0]
    if host.startswith("db.") and host.endswith(".supabase.co"):
        raise SystemExit(
            "Erro de configuração: DATABASE_URL é a ligação direta do Supabase (só IPv6; o Render não a "
            "alcança). No Supabase use Connect > Session pooler (host ...pooler.supabase.com)."
        )
    if "[" in password or "]" in password or "[" in utilizador:
        raise SystemExit(
            "Erro de configuração: DATABASE_URL contém parênteses retos [ ]. Em [YOUR-PASSWORD] os "
            "parênteses são só um marcador: substitua-o por inteiro pela password, sem [ ]."
        )
    if host.endswith(".pooler.supabase.com") and "." not in utilizador:
        raise SystemExit(
            "Erro de configuração: no Session pooler o utilizador tem de ser postgres.<ref-do-projeto> "
            "(não apenas 'postgres'). Copie o URL de Connect > Session pooler."
        )


if USA_POSTGRES:
    validar_database_url(DATABASE_URL)
if USA_POSTGRES:
    import psycopg
    from psycopg.errors import UniqueViolation
    from psycopg.rows import dict_row

    ERRO_DUPLICADO = UniqueViolation
else:
    ERRO_DUPLICADO = sqlite3.IntegrityError
PH = "%s" if USA_POSTGRES else "?"  # marcador de parâmetros de cada driver

PLACEHOLDERS = {"troca-esta-password", "mudar-esta-password", "troca-por-uma-chave-aleatoria-longa"}


def variavel_obrigatoria(nome):
    """Lê uma variável de ambiente obrigatória; recusa arrancar se faltar ou for um placeholder."""
    valor = os.environ.get(nome, "").strip()
    if not valor or valor in PLACEHOLDERS:
        raise SystemExit(
            f"Erro de configuração: defina a variável {nome} com um valor real "
            "(copie .env.example para .env e edite-o; ver README)."
        )
    return valor


ORGANIZER_EMAIL = variavel_obrigatoria("ORGANIZER_EMAIL").lower()
# Não existe password por omissão no código. A password nunca é guardada em claro:
# guardamos apenas o hash.
ORGANIZER_HASH = generate_password_hash(variavel_obrigatoria("ORGANIZER_PASSWORD"))

EVENTO = {
    "nome": "Workshop de Desenvolvimento Web 2027",
    "descricao": "Um workshop prático de um dia onde vamos construir uma aplicação "
                 "web completa, do navegador à base de dados. Aberto a todos os estudantes.",
    "data": "15 de fevereiro de 2027, 10:00 – 17:00",
    "local": "Anfiteatro 2, Edifício Principal da Universidade",
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__)
# Sem SECRET_KEY gera-se uma chave aleatória (as sessões acabam ao reiniciar).
# O valor de exemplo do .env.example é público, por isso é recusado.
_chave = os.environ.get("SECRET_KEY", "").strip()
if _chave in PLACEHOLDERS:
    raise SystemExit("Erro de configuração: troque o SECRET_KEY de exemplo por uma chave aleatória (ver .env.example).")
if USA_POSTGRES:
    # Online o serviço reinicia: sem chave fixa, o organizador perdia a sessão a cada reinício.
    _chave = variavel_obrigatoria("SECRET_KEY")
app.secret_key = _chave or token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


# --- Base de dados (Postgres se existir DATABASE_URL, senão SQLite) --------------
@contextmanager
def ligar():
    """Abre uma ligação; faz commit no fim (ou rollback se houver erro) e fecha-a."""
    if USA_POSTGRES:
        # prepare_threshold=None: compatível com o pooler do Supabase.
        ligacao = psycopg.connect(
            DATABASE_URL, row_factory=dict_row, prepare_threshold=None, connect_timeout=10
        )
    else:
        ligacao = sqlite3.connect(DB)
        ligacao.row_factory = sqlite3.Row
    try:
        with ligacao:
            yield ligacao
    finally:
        ligacao.close()


def criar_tabela():
    if USA_POSTGRES:
        coluna_id = "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY"
    else:
        os.makedirs(os.path.dirname(DB), exist_ok=True)
        coluna_id = "id INTEGER PRIMARY KEY AUTOINCREMENT"
    try:
        with ligar() as db:
            db.execute(
                f"""CREATE TABLE IF NOT EXISTS registos (
                        {coluna_id},
                        nome TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE,
                        data_registo TEXT NOT NULL
                    )"""
            )
    except Exception as erro:
        if USA_POSTGRES and isinstance(erro, psycopg.OperationalError):
            raise SystemExit(explicar_erro_ligacao(erro)) from None
        raise


def explicar_erro_ligacao(erro):
    """Traduz o erro do Postgres numa dica prática (nunca mostra o DATABASE_URL nem a password)."""
    texto = str(erro)
    primeira = texto.strip().splitlines()[0] if texto.strip() else repr(erro)
    if "password authentication failed" in texto:
        dica = ("A password do DATABASE_URL está errada. Faça Reset database password no Supabase "
                "(Project Settings > Database), use uma só com letras e números e cole-a no URL sem [ ].")
    elif "Network is unreachable" in texto:
        dica = "O Render não alcança este host (IPv6). Use a Session pooler do Supabase, não a ligação direta."
    elif "Tenant or user not found" in texto:
        dica = "Utilizador ou projeto errado: no pooler o utilizador é postgres.<ref-do-projeto>."
    elif "timeout" in texto.lower():
        dica = "A ligação excedeu o tempo limite: confirme o host/porta e que o projeto Supabase não está pausado."
    else:
        dica = "Confirme o DATABASE_URL no Render (Environment) e que o projeto Supabase está ativo."
    return f"Erro ao ligar à base de dados: {primeira}\n{dica}"


criar_tabela()


@app.context_processor
def dados_evento():
    return {"evento": EVENTO}


FUSO = ZoneInfo(os.environ.get("TIMEZONE", "Europe/Lisbon"))


@app.template_filter("datahora")
def datahora(valor):
    # O servidor (Render) corre em UTC: mostramos sempre a hora de Lisboa.
    return datetime.fromisoformat(valor).astimezone(FUSO).strftime("%d/%m/%Y %H:%M")


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
            novo_id = db.execute(
                f"INSERT INTO registos (nome, email, data_registo) VALUES ({PH}, {PH}, {PH}) RETURNING id",
                (nome, email, datetime.now(timezone.utc).isoformat()),
            ).fetchone()["id"]
    except ERRO_DUPLICADO:  # email repetido (UNIQUE)
        erros["email"] = "Este email já está registado neste evento."
        return render_template("registo.html", erros=erros, valores={"nome": nome, "email": email}), 409

    session["ultimo_registo"] = novo_id
    return redirect(url_for("confirmacao"))


@app.get("/confirmacao")
def confirmacao():
    id_registo = session.get("ultimo_registo")
    if not id_registo:
        return redirect(url_for("inicio"))
    with ligar() as db:
        reg = db.execute(f"SELECT * FROM registos WHERE id = {PH}", (id_registo,)).fetchone()
    if reg is None:
        return redirect(url_for("inicio"))
    return render_template("confirmacao.html", reg=reg)


@app.get("/saude")
def saude():
    """Verificação de saúde (Render / UptimeRobot): confirma que a base de dados responde."""
    try:
        with ligar() as db:
            db.execute("SELECT 1").fetchone()
    except Exception:
        return "erro", 503
    return "ok", 200


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
