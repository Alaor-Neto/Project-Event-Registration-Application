'use strict';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Os campos de formulário podem chegar como array/objeto; só aceitamos texto. */
function texto(valor) {
  return typeof valor === 'string' ? valor : '';
}

/**
 * Normaliza e valida os dados do registo (o servidor valida sempre,
 * mesmo que a validação do navegador tenha passado).
 */
function validarRegisto(corpo = {}) {
  const nome = texto(corpo.nome).trim().replace(/\s+/g, ' ');
  const email = texto(corpo.email).trim().toLowerCase();

  const erros = {};
  if (!nome) erros.nome = 'O nome é obrigatório.';
  else if (nome.length > 100) erros.nome = 'O nome deve ter no máximo 100 caracteres.';

  if (!email) erros.email = 'O email é obrigatório.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) {
    erros.email = 'Introduza um email válido (ex.: nome@exemplo.com).';
  }

  return { valores: { nome, email }, erros };
}

module.exports = { texto, validarRegisto };
