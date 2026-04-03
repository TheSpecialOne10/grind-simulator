import { ipcMain, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { SessionConfig, PlayerActionMessage } from '../shared/types';
import { TableManager } from './table-manager';
import { PreflopCharts } from './bot/preflop-charts';
import { join } from 'path';

let tableManager: TableManager | null = null;

export function registerIPCHandlers(lobbyWindow: BrowserWindow): void {
  const window = lobbyWindow; // For dialog parent
  // Load preflop charts
  const charts = new PreflopCharts();
  // Try loading from default data directory
  const defaultRangesDir = join(process.cwd(), 'data', 'preflop-ranges');
  const loadResult = charts.loadFromDirectory(defaultRangesDir);
  if (loadResult.loaded > 0) {
    console.log(`Loaded ${loadResult.loaded} preflop range files`);
  }
  if (loadResult.errors.length > 0) {
    console.warn('Preflop range loading errors:', loadResult.errors);
  }

  // Start session
  ipcMain.on(IPC.START_SESSION, (_event, config: SessionConfig) => {
    tableManager = new TableManager(lobbyWindow, charts);
    tableManager.startSession(config.tableCount, config.playerName);
  });

  // Stop session
  ipcMain.on(IPC.STOP_SESSION, () => {
    tableManager?.stopSession();
    tableManager = null;
  });

  // Player action
  ipcMain.on(IPC.PLAYER_ACTION, (_event, msg: PlayerActionMessage) => {
    tableManager?.handlePlayerAction(msg.tableId, msg.action, msg.amount, msg.solverNodeId);
  });

  // Table renderer ready — start that table's engine
  ipcMain.on(IPC.TABLE_READY, (_event, data: { tableId: string }) => {
    tableManager?.handleTableReady(data.tableId);
  });

  // Settings update
  ipcMain.on(IPC.UPDATE_SETTINGS, (_event, settings) => {
    // Will be implemented in Phase 4
    console.log('Settings update:', settings);
  });

  // Directory picker dialog
  ipcMain.handle(IPC.SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // File picker dialog
  ipcMain.handle(IPC.SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
