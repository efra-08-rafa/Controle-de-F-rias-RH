const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const standaloneDir = path.join(root, '.next', 'standalone');
const sourceNext = path.join(root, 'node_modules', 'next');
const targetNext = path.join(standaloneDir, 'node_modules', 'next');
const sourceSchema = path.join(root, 'database', 'sqlite-schema.sql');
const targetSchema = path.join(standaloneDir, 'database', 'sqlite-schema.sql');

if (!fs.existsSync(standaloneDir)) throw new Error(`Pasta standalone não encontrada: ${standaloneDir}`);
if (!fs.existsSync(sourceNext)) throw new Error(`Next.js não encontrado em: ${sourceNext}`);
if (!fs.existsSync(sourceSchema)) throw new Error(`Schema SQLite não encontrado em: ${sourceSchema}`);

fs.mkdirSync(path.dirname(targetNext), { recursive: true });
fs.cpSync(sourceNext, targetNext, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetSchema), { recursive: true });
fs.copyFileSync(sourceSchema, targetSchema);

const serverFile = path.join(standaloneDir, 'server.js');
if (!fs.existsSync(serverFile)) throw new Error(`server.js não encontrado em: ${serverFile}`);

console.log('Standalone preparado e validado.');
console.log(`Next.js: ${targetNext}`);
console.log(`Schema SQLite: ${targetSchema}`);
console.log(`Servidor: ${serverFile}`);
