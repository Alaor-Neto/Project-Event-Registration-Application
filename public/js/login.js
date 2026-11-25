'use strict';

// Botão para mostrar/ocultar a password no login do organizador.
(function () {
  const campo = document.getElementById('password');
  const botao = document.getElementById('alternar-password');
  const iconeMostrar = document.getElementById('icone-mostrar');
  const iconeOcultar = document.getElementById('icone-ocultar');
  if (!campo || !botao) return;

  botao.hidden = false; // sem JavaScript o botão não aparece (não teria efeito)

  function definirVisivel(visivel) {
    const texto = visivel ? 'Ocultar password' : 'Mostrar password';
    campo.type = visivel ? 'text' : 'password';
    botao.setAttribute('aria-pressed', String(visivel));
    botao.setAttribute('aria-label', texto);
    botao.title = texto;
    iconeMostrar.style.display = visivel ? 'none' : ''; // style.display funciona sempre em SVG
    iconeOcultar.style.display = visivel ? '' : 'none';
  }

  botao.addEventListener('click', function () {
    definirVisivel(campo.type === 'password');
    campo.focus();
  });

  // Ao voltar a esta página pelo histórico, a password volta a ficar escondida.
  window.addEventListener('pageshow', function () {
    definirVisivel(false);
  });
})();
