'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registarTestes } = require('./suite');

// Cada teste usa o seu próprio ficheiro temporário: nunca toca nos dados reais.
registarTestes('SQLite', async () => ({
  databaseUrl: '',
  dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'registo-')), 'teste.db'),
}));
