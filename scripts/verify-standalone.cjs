const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const required = [path.join(standalone, 'server.js'),path.join(standalone, 'database', 'sqlite-schema.sql'),path.join(standalone, '.next', 'static'),path.join(standalone, 'node_modules', 'next')];
for (const item of required) if (!fs.existsSync(item)) throw new Error(`Artefacto obrigatório ausente: ${item}`);
console.log('Standalone verification: OK');
