'use strict';

/** Mostra uma data ISO (UTC) como dd/mm/aaaa hh:mm no fuso indicado (por omissão, Lisboa). */
function datahora(valor, fuso = 'Europe/Lisbon') {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('pt-PT', {
      timeZone: fuso,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(data)
      .map((p) => [p.type, p.value])
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

module.exports = { datahora };
