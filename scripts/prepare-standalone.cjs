const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const standaloneDir = path.join(root, '.next', 'standalone');
const sourceNext = path.join(root, 'node_modules', 'next');
const targetNext = path.join(standaloneDir, 'node_modules', 'next');

if (!fs.existsSync(standaloneDir)) {
  throw new Error(`Pasta standalone não encontrada: ${standaloneDir}`);
}

if (!fs.existsSync(sourceNext)) {
  throw new Error(`Next.js não encontrado em: ${sourceNext}`);
}

fs.mkdirSync(path.dirname(targetNext), { recursive: true });
fs.cpSync(sourceNext, targetNext, { recursive: true, force: true });

const serverFile = path.join(standaloneDir, 'server.js');
if (!fs.existsSync(serverFile)) {
  throw new Error(`server.js não encontrado em: ${serverFile}`);
}

console.log('Standalone preparado com Next.js incluído:');
console.log(targetNext);
console.log(serverFile);
