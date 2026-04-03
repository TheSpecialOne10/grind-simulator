import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  ActionType, SessionConfig, Settings, TableSnapshot, SoundTrigger
} from '../shared/types';

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
  updateSettings: (settings: Partial<Settings>) => {
    ipcRenderer.send(IPC.UPDATE_SETTINGS, settings);
  },

  // Dialogs
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  selectFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.SELECT_FILE),

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
};

contextBridge.exposeInMainWorld('grindSim', api);

export type GrindSimAPI = typeof api;
