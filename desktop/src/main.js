const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const isDev = process.env.NODE_ENV === 'development';
const WEB_URL = isDev ? 'http://localhost:3000' : 'http://localhost:3000';
const SERVER_PORT = 8000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    frame: true,
    backgroundColor: '#f7fafc',
  });

  // Load the web app
  mainWindow.loadURL(WEB_URL);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  if (isDev) {
    const serverPath = path.join(__dirname, '..', '..', 'server');
    serverProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--port', SERVER_PORT.toString()], {
      cwd: serverPath,
      shell: true,
    });
  } else {
    const executablePath = path.join(process.resourcesPath, 'server_backend.exe');
    serverProcess = spawn(executablePath, [], {
      shell: false,
    });
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// IPC handlers for audio capture
ipcMain.handle('get-audio-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }));
});

ipcMain.handle('get-system-audio', async () => {
  // Return the system audio source ID for capture
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    fetchWindowIcons: false,
  });

  if (sources.length > 0) {
    return sources[0].id;
  }
  return null;
});

app.whenReady().then(() => {
  // Start the backend server
  startServer();

  // Wait a bit for server to start, then create window
  setTimeout(createWindow, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});
