const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');

let server;
let logFile;

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

function startServer() {
  const appDir = path.join(process.resourcesPath, 'app');
  const nodeExe = path.join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  const serverFile = path.join(appDir, 'server.js');
  const userDataDir = app.getPath('userData');
  logFile = path.join(userDataDir, 'logs', 'app.log');

  writeLog(`Iniciando aplicativo. appDir=${appDir}`);
  writeLog(`Node runtime=${nodeExe}`);
  writeLog(`Server=${serverFile}`);

  if (!fs.existsSync(nodeExe)) throw new Error(`Node runtime não encontrado: ${nodeExe}`);
  if (!fs.existsSync(serverFile)) throw new Error(`Servidor Next não encontrado: ${serverFile}`);

  server = spawn(nodeExe, [serverFile], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: '127.0.0.1',
      DATABASE_MODE: 'local',
      LOCAL_DATABASE_PATH: path.join(userDataDir, 'data', 'controle-ferias.sqlite'),
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
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Servidor local não iniciou a tempo. ${lastError}`);
}

async function createWindow() {
  startServer();
  await waitForServer('http://127.0.0.1:3000');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`RENDERER GONE: ${details.reason}`);
  });

  await win.loadURL('http://127.0.0.1:3000');
}

app.whenReady().then(createWindow).catch((error) => {
  writeLog(`STARTUP ERROR: ${error.stack || error.message}`);
  dialog.showErrorBox('Controle de Férias RH', `O programa não conseguiu iniciar.\n\n${error.message}\n\nO diagnóstico foi guardado em:\n${logFile}`);
  if (server) server.kill();
  app.quit();
});

app.on('window-all-closed', () => {
  if (server) server.kill();
  if (process.platform !== 'darwin') app.quit();
});
