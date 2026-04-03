import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'path';
import { registerIPCHandlers } from './ipc-handlers';

// Remove application menu globally
Menu.setApplicationMenu(null);

function createLobbyWindow(): BrowserWindow {
  const lobbyWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'Grind Simulator',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  registerIPCHandlers(lobbyWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    lobbyWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    lobbyWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return lobbyWindow;
}

app.whenReady().then(() => {
  const lobbyWindow = createLobbyWindow();

  // When lobby closes, close all table windows and quit
  lobbyWindow.on('closed', () => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.close();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLobbyWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
