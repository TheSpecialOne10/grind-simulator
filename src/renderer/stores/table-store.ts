import { create } from 'zustand';
import type { TableSnapshot } from '../../shared/types';

interface TableUIState {
  snapshot: TableSnapshot | null;
  isAnimating: boolean;

  setSnapshot: (snapshot: TableSnapshot) => void;
  setAnimating: (animating: boolean) => void;
}

/** Factory: create a per-table Zustand store. */
export function createTableStore() {
  return create<TableUIState>((set) => ({
    snapshot: null,
    isAnimating: false,

    setSnapshot: (snapshot) => set({ snapshot }),
    setAnimating: (animating) => set({ isAnimating: animating }),
  }));
}

export type TableStore = ReturnType<typeof createTableStore>;
