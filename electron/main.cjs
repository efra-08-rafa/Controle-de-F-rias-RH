const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');

let server;
let win;

function getSessionSecret() {
  const secretFile = path.join(app.getPath('userData'), 'session-secret');
  try {
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
    const secret = randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, secret, 'utf8');
    return secret;
  } catch {
    return randomBytes(48).toString('hex');
  }
}

function encontrarServidor() {
  const candidatos = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app', 'server.js'),
        path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js')
      ]
    : [
        path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
        path.join(process.cwd(), '.next', 'standalone', 'server.js')
      ];

  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) return candidato;
  }

  throw new Error('Servidor interno do sistema não foi encontrado.');
}

function telaInicial() {
  if (!win || win.isDestroyed()) return;
  const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Controle de Férias RH</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8f2;font-family:Arial,sans-serif;color:#111}
.box{text-align:center;background:#fff;border-radius:20px;padding:42px 50px;box-shadow:0 16px 50px #00000014}
.logo{font-size:42px;margin-bottom:12px}.title{font-size:24px;font-weight:700}.text{margin-top:10px;color:#555}.loader{width:34px;height:34px;margin:24px auto 0;border:4px solid #dfe9df;border-top-color:#245c3a;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body><div class="box"><div class="logo">🌿</div><div class="title">Controle de Férias RH</div><div class="text">A preparar o sistema...</div><div class="loader"></div></div></body>
</html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
}

function startServer() {
  const serverFile = encontrarServidor();
  const appDir = path.dirname(serverFile);
  const dataDir = path.join(app.getPath('userData'), 'data');

  fs.mkdirSync(dataDir, { recursive: true });

  server = spawn(process.execPath, [serverFile], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: '127.0.0.1',
      DATABASE_MODE: 'local',
      LOCAL_DATABASE_PATH: path.join(dataDir, 'controle-ferias.sqlite'),
      SESSION_SECRET: getSessionSecret()
    },
    windowsHide: true,
    stdio: 'ignore'
  });
}

async function waitForServer(url, attempts = 60) {
  let lastError = '';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`O servidor interno não iniciou a tempo${lastError ? ` (${lastError})` : ''}.`);
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    show: true,
    backgroundColor: '#f4f8f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  telaInicial();

  try {
    startServer();
    await waitForServer('http://127.0.0.1:3000/login');
    await win.loadURL('http://127.0.0.1:3000/login');
  } catch (error) {
    dialog.showErrorBox(
      'Controle de Férias RH',
      `Não foi possível iniciar o sistema.\n\n${error.message || String(error)}`
    );
    if (server) server.kill();
    app.quit();
  }
}

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('Controle de Férias RH', `Erro ao iniciar o sistema.\n\n${error.message || String(error)}`);
  if (server) server.kill();
  app.quit();
});

app.on('window-all-closed', () => {
  if (server) server.kill();
  if (process.platform !== 'darwin') app.quit();
});
