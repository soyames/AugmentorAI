const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const httpProxy = require('http-proxy');

let mainWindow;
let serverProcess;
let webServer;

const isDev = !app.isPackaged;
const BACKEND_PORT = 8010;
const WEB_PORT = 29100;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function getWebDistPath() {
  return path.join(__dirname, '..', 'web-dist');
}

function resolveStaticPath(urlPath) {
  const webDistPath = getWebDistPath();
  const safePath = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = safePath === '/' ? 'index.html' : safePath.replace(/^\//, '');
  const filePath = path.join(webDistPath, relativePath);

  if (!filePath.startsWith(webDistPath)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }

  return path.join(webDistPath, 'index.html');
}

function startWebServer() {
  const proxy = httpProxy.createProxyServer({ ws: true });
  const backendTarget = `http://127.0.0.1:${BACKEND_PORT}`;

  proxy.on('error', (error, req, res) => {
    console.error('Proxy error:', error.message);
    if (res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Backend unavailable. Please restart AugmentorAI.');
    }
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestPath = req.url || '/';

      if (requestPath.startsWith('/api') || requestPath.startsWith('/ws')) {
        proxy.web(req, res, { target: backendTarget });
        return;
      }

      const filePath = resolveStaticPath(requestPath);
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        res.writeHead(200, {
          'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        });
        res.end(data);
      });
    });

    server.on('upgrade', (req, socket, head) => {
      proxy.ws(req, socket, head, { target: backendTarget });
    });

    server.listen(WEB_PORT, '127.0.0.1', () => {
      console.log(`Web UI server listening on http://127.0.0.1:${WEB_PORT}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

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
    show: false,
  });

  const appUrl = isDev ? 'http://localhost:3000' : `http://127.0.0.1:${WEB_PORT}`;
  mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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
    serverProcess = spawn(
      'python',
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
      {
        cwd: serverPath,
        shell: true,
      },
    );
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

function stopWebServer() {
  if (webServer) {
    webServer.close();
    webServer = null;
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
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    fetchWindowIcons: false,
  });

  if (sources.length > 0) {
    return sources[0].id;
  }
  return null;
});

app.whenReady().then(async () => {
  startServer();

  if (!isDev) {
    try {
      webServer = await startWebServer();
    } catch (error) {
      console.error('Failed to start web UI server:', error);
      app.quit();
      return;
    }
  }

  // Give the Python backend a moment to boot before loading the UI.
  setTimeout(createWindow, 2500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopWebServer();
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopWebServer();
  stopServer();
});