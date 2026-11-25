'use strict';

// Validação no navegador (o servidor volta a validar sempre).
(function () {
  const form = document.getElementById('form');
  if (!form) return;

  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function mostrarErro(campo, mensagem) {
    document.getElementById('erro-' + campo).textContent = mensagem;
    document.getElementById(campo).classList.toggle('is-invalid', mensagem !== '');
  }

  form.addEventListener('submit', function (evento) {
    const nome = form.nome.value.trim();
    const email = form.email.value.trim();

    const erroNome = nome ? '' : 'O nome é obrigatório.';
    let erroEmail = '';
    if (!email) erroEmail = 'O email é obrigatório.';
    else if (!emailRe.test(email)) erroEmail = 'Introduza um email válido (ex.: nome@exemplo.com).';

    mostrarErro('nome', erroNome);
    mostrarErro('email', erroEmail);
    if (erroNome || erroEmail) evento.preventDefault();
  });
})();
