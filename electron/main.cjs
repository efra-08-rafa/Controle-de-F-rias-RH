const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');

let server;
let logFile;
let win;
let paginaCarregada = false;

function writeLog(message) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {}
}

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

  throw new Error(`Servidor Next não encontrado. Caminhos verificados:\n${candidatos.join('\n')}`);
}

function telaDiagnostico(titulo, mensagem) {
  if (!win || win.isDestroyed()) return;
  const esc = (valor) => String(valor).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>body{font-family:Arial,sans-serif;background:#f4f8f2;margin:0;padding:48px;color:#111}.box{max-width:820px;margin:auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 10px 35px #0002;border-top:6px solid #245c3a}h1{margin:0 0 14px;color:#245c3a}p{line-height:1.55}code{display:block;word-break:break-all;background:#eef2ed;padding:12px;border-radius:8px;margin-top:8px}</style></head><body><div class="box"><h1>${esc(titulo)}</h1><p>${esc(mensagem)}</p><p>O diagnóstico foi guardado neste ficheiro:</p><code>${esc(logFile)}</code><p>Pode fechar esta janela e abrir novamente o programa.</p></div></body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
}

function startServer() {
  const serverFile = encontrarServidor();
  const appDir = path.dirname(serverFile);
  const userDataDir = app.getPath('userData');
  logFile = path.join(userDataDir, 'logs', 'app.log');
  const dataDir = path.join(userDataDir, 'data');

  fs.mkdirSync(dataDir, { recursive: true });
  writeLog(`Iniciando aplicativo. packaged=${app.isPackaged}`);
  writeLog(`Server=${serverFile}`);
  writeLog(`Electron=${process.execPath}`);

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
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (data) => writeLog(`SERVER: ${data.toString().trim()}`));
  server.stderr.on('data', (data) => writeLog(`SERVER ERROR: ${data.toString().trim()}`));
  server.on('error', (error) => writeLog(`PROCESS ERROR: ${error.stack || error.message}`));
  server.on('exit', (code, signal) => writeLog(`SERVER EXIT: code=${code} signal=${signal}`));
}

async function waitForServer(url, attempts = 60) {
  let lastError = '';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      writeLog(`Teste do servidor: ${response.status} ${url}`);
      if (response.status >= 200 && response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor local não iniciou a tempo. ${lastError}`);
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

  win.webContents.on('did-start-loading', () => writeLog('Navegação iniciada.'));
  win.webContents.on('dom-ready', () => writeLog(`DOM pronto: ${win.webContents.getURL()}`));
  win.webContents.on('did-finish-load', () => {
    paginaCarregada = true;
    writeLog(`Página carregada: ${win.webContents.getURL()}`);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`FALHA AO CARREGAR: code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    if (validatedURL.startsWith('http://127.0.0.1:3000')) {
      telaDiagnostico('Falha ao carregar o sistema', `O servidor iniciou, mas a aplicação não conseguiu carregar. Erro: ${errorDescription} (código ${errorCode}).`);
    }
  });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(`CONSOLE: level=${level} line=${line} source=${sourceId} message=${message}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`RENDERER GONE: ${details.reason}`);
    telaDiagnostico('A janela encontrou um erro', `O processo visual do aplicativo foi encerrado (${details.reason}).`);
  });

  try {
    telaDiagnostico('A iniciar o Controle de Férias RH', 'A preparar o sistema...');
    startServer();
    await waitForServer('http://127.0.0.1:3000/login');
    writeLog('Servidor confirmado. Abrindo /login.');
    await win.loadURL('http://127.0.0.1:3000/login');
    setTimeout(() => {
      if (!paginaCarregada && win && !win.isDestroyed()) {
        writeLog('TIMEOUT: página não terminou de carregar após 15 segundos.');
        telaDiagnostico('O sistema demorou a carregar', 'O servidor respondeu, mas a página não terminou de carregar. O diagnóstico foi registado automaticamente.');
      }
    }, 15000);
  } catch (error) {
    writeLog(`STARTUP ERROR: ${error.stack || error.message}`);
    telaDiagnostico('Não foi possível iniciar o sistema', error.message || String(error));
    dialog.showErrorBox('Controle de Férias RH', `O programa encontrou um problema ao iniciar.\n\n${error.message || error}\n\nO diagnóstico foi guardado em:\n${logFile}`);
    if (server) server.kill();
  }
}

app.whenReady().then(createWindow).catch((error) => {
  writeLog(`READY ERROR: ${error.stack || error.message}`);
  dialog.showErrorBox('Controle de Férias RH', `Erro de arranque.\n\n${error.message || error}`);
  if (server) server.kill();
  app.quit();
});

app.on('window-all-closed', () => {
  if (server) server.kill();
  if (process.platform !== 'darwin') app.quit();
});
