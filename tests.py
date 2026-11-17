"""Testes dos 7 testes obrigatórios. Executar: python tests.py"""
import importlib, os, sqlite3, subprocess, sys, tempfile, unittest

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


if __name__ == "__main__":
    unittest.main()
