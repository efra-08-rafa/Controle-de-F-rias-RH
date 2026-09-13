const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

let server;

function startServer() {
  const appDir = path.join(process.resourcesPath, 'app');
  const nodeExe = path.join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  const serverFile = path.join(appDir, 'server.js');
  const userDataDir = app.getPath('userData');
  const sessionSecret = randomBytes(48).toString('hex');

  server = spawn(nodeExe, [serverFile], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: '127.0.0.1',
      DATABASE_MODE: 'local',
      LOCAL_DATABASE_PATH: path.join(userDataDir, 'data', 'controle-ferias.sqlite'),
      SESSION_SECRET: sessionSecret
    },
    windowsHide: true,
    stdio: 'ignore'
  });
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Servidor local não iniciou a tempo.');
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

  await win.loadURL('http://127.0.0.1:3000');
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (server) server.kill();
  if (process.platform !== 'darwin') app.quit();
});
