import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  ActionType, PreflopFeedbackData, PostflopFeedbackData, SessionConfig, SpotSessionConfig,
  Settings, TableSnapshot, SoundTrigger
} from '../shared/types';
import type { SpotConfig } from '../main/spot-trainer/spot-config';

const api = {
  // Send player action (includes solver node ID for tree navigation)
  sendAction: (tableId: string, action: ActionType, amount: number, solverNodeId: string) => {
    ipcRenderer.send(IPC.PLAYER_ACTION, { tableId, action, amount, solverNodeId });
  },

  // Session control
  startSession: (config: SessionConfig) => ipcRenderer.send(IPC.START_SESSION, config),
  stopSession: () => ipcRenderer.send(IPC.STOP_SESSION),

  // Listen for state updates — returns unsubscribe function
  onTableUpdate: (callback: (snapshot: TableSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: TableSnapshot) => callback(snapshot);
    ipcRenderer.on(IPC.TABLE_STATE_UPDATE, handler);
    return () => { ipcRenderer.removeListener(IPC.TABLE_STATE_UPDATE, handler); };
  },

  // Listen for sound triggers
  onSoundTrigger: (callback: (data: SoundTrigger) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SoundTrigger) => callback(data);
    ipcRenderer.on(IPC.SOUND_TRIGGER, handler);
    return () => { ipcRenderer.removeListener(IPC.SOUND_TRIGGER, handler); };
  },

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  updateSettings: (settings: Partial<Settings>) => {
    ipcRenderer.send(IPC.UPDATE_SETTINGS, settings);
  },

  // Dialogs
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  selectFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.SELECT_FILE),

  // Focus this BrowserWindow (called from renderer on mousemove for hover-to-focus)
  focusWindow: () => {
    ipcRenderer.send(IPC.FOCUS_WINDOW);
  },

  // Signal that the table renderer is mounted and ready to receive snapshots
  signalTableReady: (tableId: string) => {
    ipcRenderer.send(IPC.TABLE_READY, { tableId });
  },

  // Window identification: read tableId from URL query string
  getTableIdFromURL: (): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tableId');
  },

  // Table window init (main sends tableId + humanSeatIndex after window loads)
  onTableInit: (callback: (data: { tableId: string; humanSeatIndex: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tableId: string; humanSeatIndex: number }) => callback(data);
    ipcRenderer.on(IPC.TABLE_INIT, handler);
    return () => { ipcRenderer.removeListener(IPC.TABLE_INIT, handler); };
  },

  // Preflop feedback after each hero preflop action
  onPreflopFeedback: (callback: (data: PreflopFeedbackData | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PreflopFeedbackData | null) => callback(data);
    ipcRenderer.on(IPC.PREFLOP_FEEDBACK, handler);
    return () => { ipcRenderer.removeListener(IPC.PREFLOP_FEEDBACK, handler); };
  },

  // Postflop feedback after each hero postflop action (Spot Trainer mode)
  onPostflopFeedback: (callback: (data: PostflopFeedbackData | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PostflopFeedbackData | null) => callback(data);
    ipcRenderer.on(IPC.POSTFLOP_FEEDBACK, handler);
    return () => { ipcRenderer.removeListener(IPC.POSTFLOP_FEEDBACK, handler); };
  },

  // Start a Spot Trainer session
  startSpotSession: (config: SpotSessionConfig) => {
    ipcRenderer.send(IPC.START_SPOT_SESSION, config);
  },

  // Get available spot catalog (API-backed, filtered to locally available ranges)
  getSpotCatalog: (): Promise<SpotConfig[]> => ipcRenderer.invoke(IPC.GET_SPOT_CATALOG),

  // Zoom early fold — hero pre-folds before their turn
  zoomFoldEarly: (tableId: string) => {
    ipcRenderer.send(IPC.ZOOM_FOLD_EARLY, { tableId });
  },

  // Zoom mode: redirect renderer to a different tableId
  onZoomRedirect: (callback: (data: { tableId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tableId: string }) => callback(data);
    ipcRenderer.on(IPC.ZOOM_REDIRECT, handler);
    return () => { ipcRenderer.removeListener(IPC.ZOOM_REDIRECT, handler); };
  },
};

contextBridge.exposeInMainWorld('grindSim', api);

export type GrindSimAPI = typeof api;
