import { create } from 'zustand';
import type { Settings, TableSnapshot } from '../../shared/types';
import { DEFAULTS } from '../../shared/constants';

interface GlobalState {
  isSessionActive: boolean;
  tableCount: number;
  playerName: string;
  tables: Map<string, TableSnapshot>;
  settings: Settings;
  focusedTableId: string | null;

  // Actions
  setSessionActive: (active: boolean) => void;
  setTableCount: (count: number) => void;
  setPlayerName: (name: string) => void;
  updateTable: (tableId: string, snapshot: TableSnapshot) => void;
  removeTable: (tableId: string) => void;
  setFocusedTable: (tableId: string | null) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  reset: () => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  isSessionActive: false,
  tableCount: 1,
  playerName: DEFAULTS.playerName,
  tables: new Map(),
  settings: {
    masterVolume: DEFAULTS.masterVolume,
    handHistoryPath: DEFAULTS.handHistoryPath,
    solverDataPath: DEFAULTS.solverDataPath,
    solverExecutablePath: DEFAULTS.solverExecutablePath,
    solverMode: DEFAULTS.solverMode,
    solverServerHost: DEFAULTS.solverServerHost,
    solverServerPort: DEFAULTS.solverServerPort,
    playerName: DEFAULTS.playerName,
  },
  focusedTableId: null,

  setSessionActive: (active) => set({ isSessionActive: active }),
  setTableCount: (count) => set({ tableCount: count }),
  setPlayerName: (name) => set({ playerName: name }),

  updateTable: (tableId, snapshot) => set((state) => {
    const tables = new Map(state.tables);
    tables.set(tableId, snapshot);
    return { tables };
  }),

  removeTable: (tableId) => set((state) => {
    const tables = new Map(state.tables);
    tables.delete(tableId);
    return { tables };
  }),

  setFocusedTable: (tableId) => set({ focusedTableId: tableId }),

  updateSettings: (partial) => set((state) => ({
    settings: { ...state.settings, ...partial }
  })),

  reset: () => set({
    isSessionActive: false,
    tables: new Map(),
    focusedTableId: null,
  }),
}));
