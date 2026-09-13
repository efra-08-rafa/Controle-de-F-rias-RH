const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

let server;

function startServer() {
  const nextBin = path.join(process.resourcesPath, 'app', 'node_modules', 'next', 'dist', 'bin', 'next');
  const appDir = path.join(process.resourcesPath, 'app');
  server = spawn(process.execPath, [nextBin, 'start', '-p', '3000'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_MODE: 'local',
      LOCAL_DATABASE_PATH: path.join(app.getPath('userData'), 'data', 'controle-ferias.sqlite')
    },
    windowsHide: true,
    stdio: 'ignore'
  });
}

async function waitForServer(url, attempts = 40) {
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
