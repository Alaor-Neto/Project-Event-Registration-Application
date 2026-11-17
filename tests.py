"""Testes dos 7 testes obrigatórios. Executar: python tests.py"""
import importlib, os, sqlite3, subprocess, sys, tempfile, unittest

# Os testes nunca devem tocar na base de dados online, mesmo que DATABASE_URL esteja definido.
os.environ.pop("DATABASE_URL", None)
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "teste.db")
os.environ["ORGANIZER_EMAIL"] = "org@example.com"
os.environ["ORGANIZER_PASSWORD"] = "segredo123"
import main  # noqa: E402


class Testes(unittest.TestCase):
    def setUp(self):
        self.c = main.app.test_client()

    def test_1_registo_valido(self):
        r = self.c.post("/registo", data={"nome": "Ana", "email": "ana@x.com"})
        self.assertEqual(r.status_code, 302)
        self.assertIn(b"Registo confirmado", self.c.get("/confirmacao").data)

    def test_2_campos_invalidos(self):
        self.assertEqual(self.c.post("/registo", data={"nome": "", "email": "a@x.com"}).status_code, 400)
        self.assertEqual(self.c.post("/registo", data={"nome": "Rui", "email": "invalido"}).status_code, 400)

    def test_3_email_repetido(self):
        self.c.post("/registo", data={"nome": "Bia", "email": "bia@x.com"})
        self.assertEqual(self.c.post("/registo", data={"nome": "Bia", "email": "BIA@x.com"}).status_code, 409)

    def test_4_mesmo_nome_email_diferente(self):
        self.c.post("/registo", data={"nome": "Joao Silva", "email": "j1@x.com"})
        self.assertEqual(self.c.post("/registo", data={"nome": "Joao Silva", "email": "j2@x.com"}).status_code, 302)

    def test_5_organizador_tabela_e_total(self):
        r = self.c.post("/organizador/login", data={"email": "org@example.com", "password": "segredo123"})
        self.assertEqual(r.status_code, 302)
        pagina = self.c.get("/organizador").data.decode()
        n = sqlite3.connect(main.DB).execute("SELECT COUNT(*) FROM registos").fetchone()[0]
        self.assertIn(f'id="total">{n}<', pagina)
        self.assertEqual(self.c.post("/organizador/login", data={"email": "org@example.com", "password": "errada"}).status_code, 401)

    def test_6_acesso_negado_sem_login(self):
        self.assertEqual(self.c.get("/organizador").status_code, 302)

    def test_7_persistencia(self):
        self.c.post("/registo", data={"nome": "Persist", "email": "p@x.com"})
        importlib.reload(main)  # simula reiniciar a aplicação
        linhas = sqlite3.connect(main.DB).execute("SELECT 1 FROM registos WHERE email='p@x.com'").fetchall()
        self.assertEqual(len(linhas), 1)

    def test_8_extra_sem_password_nao_arranca(self):
        """Extra: sem ORGANIZER_PASSWORD a aplicação recusa arrancar (não há password por omissão)."""
        env = {k: v for k, v in os.environ.items() if k != "ORGANIZER_PASSWORD"}
        pasta = os.path.dirname(os.path.abspath(main.__file__))
        r = subprocess.run([sys.executable, "-c", "import main"], cwd=pasta, env=env, capture_output=True)
        self.assertNotEqual(r.returncode, 0)

    def test_9_extra_saude(self):
        """Extra: /saude responde 200 quando a base de dados está acessível (usado pelo UptimeRobot)."""
        r = self.c.get("/saude")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, b"ok")

    def test_10_extra_ligacao_direta_supabase_recusada(self):
        """Extra: a ligação direta do Supabase (só IPv6) é recusada com uma dica."""
        with self.assertRaises(SystemExit) as e:
            main.validar_database_url("postgresql://postgres:abc@db.xyz.supabase.co:5432/postgres")
        self.assertIn("Session pooler", str(e.exception))

    def test_11_extra_parenteses_na_password_recusados(self):
        """Extra: [YOUR-PASSWORD] colado com os parênteses é detetado."""
        with self.assertRaises(SystemExit):
            main.validar_database_url("postgresql://postgres.ref:[abc]@aws-1-eu-west-1.pooler.supabase.com:5432/postgres")

    def test_12_extra_pooler_valido_e_utilizador_sem_ref(self):
        """Extra: URL do pooler correto passa; utilizador 'postgres' simples no pooler é recusado."""
        main.validar_database_url("postgresql://postgres.ref:abc123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres")
        with self.assertRaises(SystemExit):
            main.validar_database_url("postgresql://postgres:abc123@aws-1-eu-west-1.pooler.supabase.com:5432/postgres")

    def test_13_extra_hora_de_lisboa(self):
        """Extra: as datas aparecem na hora de Lisboa (inverno UTC+0, verão UTC+1)."""
        self.assertEqual(main.datahora("2027-01-15T12:00:00+00:00"), "15/01/2027 12:00")
        self.assertEqual(main.datahora("2027-07-15T12:00:00+00:00"), "15/07/2027 13:00")

    def test_14_extra_sessao_do_organizador_expira(self):
        """Extra: o login do organizador é uma sessão com prazo (30 min de inatividade)."""
        self.c.post("/organizador/login", data={"email": "org@example.com", "password": "segredo123"})
        with self.c.session_transaction() as s:
            self.assertTrue(s.permanent)
        self.assertEqual(main.app.permanent_session_lifetime.total_seconds(), 30 * 60)
        # Simula uma sessão expirada: o cookie deixa de ser aceite e o acesso é negado.
        self.c.delete_cookie("session")
        self.assertEqual(self.c.get("/organizador").status_code, 302)


if __name__ == "__main__":
    unittest.main()
