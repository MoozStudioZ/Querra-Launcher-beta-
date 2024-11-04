const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { MinecraftLauncher } = require('./src/minecraft/launcher');
const { VersionManager } = require('./src/minecraft/version-manager');
const logger = require('./src/minecraft/logger');

// Fix for GPU process errors
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');
app.disableHardwareAcceleration();

const store = new Store();
let mainWindow;
let launcher;
let versionManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    frame: false,
    backgroundColor: '#2e2c29',
    show: false
  });

  mainWindow.loadFile('src/ui/index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-change', 'maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-change', 'normal');
  });
}

app.whenReady().then(() => {
  try {
    launcher = new MinecraftLauncher();
    versionManager = new VersionManager(launcher.getMinecraftDir());
    logger.info('Launcher initialized successfully');
    createWindow();
  } catch (error) {
    logger.error('Failed to initialize launcher:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Event Handlers
ipcMain.handle('get-versions', async () => {
  try {
    return await versionManager.getAvailableVersions();
  } catch (error) {
    logger.error('Failed to get versions:', error);
    throw error;
  }
});

ipcMain.handle('get-installed-versions', async () => {
  try {
    return await versionManager.getInstalledVersions();
  } catch (error) {
    logger.error('Failed to get installed versions:', error);
    throw error;
  }
});

ipcMain.handle('check-version', async (event, versionId) => {
  try {
    return await versionManager.isVersionInstalled(versionId);
  } catch (error) {
    logger.error('Failed to check version:', error);
    throw error;
  }
});


ipcMain.handle('download-version', async (event, { versionId, versionUrl }) => {
  try {
    await versionManager.downloadVersion(versionId, versionUrl, (current, total, phase) => {
      mainWindow.webContents.send('download-progress', { current, total, phase });
    });
    return true;
  } catch (error) {
    logger.error('Download failed:', error);
    throw error;
  }
});

ipcMain.handle('launch-game', async (event, { username, version, ram }) => {
  try {
    await launcher.launchGame(username, version, ram);
    logger.info(`Launching game: ${version} with username ${username}`);
    return true;
  } catch (error) {
    logger.error('Launch failed:', error);
    throw error;
  }
});

// Window controls
ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  mainWindow.close();
});