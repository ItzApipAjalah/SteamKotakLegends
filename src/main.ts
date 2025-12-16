import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { GameController } from './controllers/GameController';
import { AccountController } from './controllers/AccountController';
import { SteamToolsController } from './controllers/SteamToolsController';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

const createSplashWindow = () => {
  // Create the splash window
  splashWindow = new BrowserWindow({
    width: 450,
    height: 350,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load splash.html
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    // In development, load from the same server
    const splashUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '') + '/splash.html';
    splashWindow.loadURL(splashUrl);
  } else {
    splashWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/splash.html`),
    );
  }
};

const createMainWindow = () => {
  // Create the main browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f0f23',
      symbolColor: '#a855f7',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f0f23',
    show: false, // Don't show until ready
  });

  // Register IPC handlers
  GameController.registerHandlers();
  AccountController.registerHandlers();
  SteamToolsController.registerHandlers();

  // Load the index.html of the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // When the main window is ready, show it and close splash
  mainWindow.once('ready-to-show', () => {
    // Add a small delay for the splash animation to complete
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 2800); // Wait for splash animation to complete (~3 seconds)
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const createWindow = () => {
  // First, show splash screen
  createSplashWindow();

  // Then create main window (hidden)
  createMainWindow();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
