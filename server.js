'use strict';

const { carregarEnv, lerConfig, ErroConfiguracao } = require('./src/config');
const { abrirBaseDeDados } = require('./src/db');
const { criarApp } = require('./src/app');

async function main() {
  carregarEnv();
  const config = lerConfig();
  const bd = await abrirBaseDeDados(config);
  const app = criarApp(config, bd);

  const servidor = app.listen(config.porta, () => {
    console.log(`Aplicação disponível em http://localhost:${config.porta} (base de dados: ${bd.tipo})`);
  });

  // Fecha o servidor e a base de dados de forma ordenada (Ctrl+C, "docker stop" ou reinício no Render).
  function terminar() {
    servidor.close(async () => {
      await bd.fechar();
      process.exit(0);
    });
    servidor.closeAllConnections();
  }
  process.on('SIGINT', terminar);
  process.on('SIGTERM', terminar);
}

main().catch((erro) => {
  if (erro instanceof ErroConfiguracao) {
    console.error(erro.message);
    process.exit(1);
  }
  console.error(erro);
  process.exit(1);
});
