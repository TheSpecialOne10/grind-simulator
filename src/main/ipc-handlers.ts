import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { SessionConfig, PlayerActionMessage, SpotSessionConfig } from '../shared/types';
import { TableManager } from './table-manager';
import { PreflopCharts } from './bot/preflop-charts';
import { loadSettings, updateSettings } from './settings-store';
import { join } from 'path';
import { PostflopApiClient, NullPostflopApiClient } from './spot-trainer/postflop-api-client';
import { buildSpotCatalog } from './spot-trainer/spot-config';

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

  // Warm up API connection at startup (DNS resolve + TLS handshake)
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env ?? {};
    const apiUrl: string = env.API_URL || '';
    const apiKey: string = env.API_KEY || '';
    if (apiUrl) {
      const startupClient = new PostflopApiClient(apiUrl, apiKey);
      startupClient.warmUp().catch(() => {});
    }
  }

  // Start session
  ipcMain.on(IPC.START_SESSION, (_event, config: SessionConfig) => {
    tableManager = new TableManager(lobbyWindow, charts);
    tableManager.startSession(config.tableCount, config.playerName, undefined, config.revealBotCards, config.zoomMode);
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

  // Zoom early fold — hero folds before their turn arrives
  ipcMain.on(IPC.ZOOM_FOLD_EARLY, (_event, data: { tableId: string }) => {
    tableManager?.handleEarlyFold(data.tableId);
  });

  // Focus the BrowserWindow that sent this message (hover-to-focus)
  ipcMain.on(IPC.FOCUS_WINDOW, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed() && !win.isFocused()) {
      win.focus();
    }
  });

  // Settings update — persist to disk
  ipcMain.on(IPC.UPDATE_SETTINGS, (_event, partial) => {
    updateSettings(partial);
  });

  // Settings get — load from disk (used by both lobby and table windows)
  ipcMain.handle(IPC.GET_SETTINGS, () => {
    return loadSettings();
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

  // Start Spot Trainer session
  ipcMain.on(IPC.START_SPOT_SESSION, (_event, config: SpotSessionConfig) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env ?? {};
    const apiBaseUrl: string = env.API_URL || '';
    const apiKey: string = env.API_KEY || '';

    const apiClient = apiBaseUrl
      ? new PostflopApiClient(apiBaseUrl, apiKey)
      : new NullPostflopApiClient();

    (async () => {
      // Warm up TCP connection (DNS + TLS handshake) while fetching scenarios
      if ('warmUp' in apiClient) (apiClient as PostflopApiClient).warmUp().catch(() => {});
      const scenarios = await apiClient.getScenarios();
      if (!scenarios) {
        console.warn('[SpotSession] Could not fetch scenarios from API — using NullApiClient');
        return;
      }
      const catalog = buildSpotCatalog(scenarios, charts);
      const spotConfig = catalog.find(s => s.id === config.spotId);
      if (!spotConfig) {
        console.error(`[SpotSession] Spot "${config.spotId}" not found in catalog`);
        return;
      }
      const boards = await apiClient.getBoards(spotConfig.id) ?? [];
      console.log(`[SpotSession] Fetched ${boards.length} boards for spot "${spotConfig.id}"`);
      tableManager = new TableManager(lobbyWindow, charts);
      tableManager.startSpotSession(
        spotConfig,
        config.heroSide,
        config.tableCount,
        config.playerName,
        apiClient,
        boards
      );
    })().catch(err => console.error('[SpotSession] Failed to start:', err));
  });

  // Get spot catalog — fetches from API and filters by local range files
  ipcMain.handle(IPC.GET_SPOT_CATALOG, async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any).env ?? {};
    const apiBaseUrl: string = env.API_URL || '';
    const apiKey: string = env.API_KEY || '';

    console.log(`[SpotCatalog] API_URL=${apiBaseUrl || '(empty)'} API_KEY=${apiKey ? '(set)' : '(empty)'}`);

    if (!apiBaseUrl) return [];

    const apiClient = new PostflopApiClient(apiBaseUrl, apiKey);
    const scenarios = await apiClient.getScenarios();
    console.log(`[SpotCatalog] scenarios=${scenarios === null ? 'null' : scenarios.length}`);
    if (!scenarios) return [];
    const catalog = buildSpotCatalog(scenarios, charts);
    console.log(`[SpotCatalog] catalog spots=${catalog.length}`);
    return catalog;
  });
}
