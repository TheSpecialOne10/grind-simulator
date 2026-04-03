import { useEffect, useState } from 'react';
import type { TableSnapshot } from '../../shared/types';

/**
 * Subscribe to table state updates via IPC.
 * Filters by tableId and returns the latest snapshot.
 */
export function useTableState(tableId: string | null): TableSnapshot | null {
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);

  useEffect(() => {
    if (!tableId) return;

    const unsubscribe = window.grindSim.onTableUpdate((s) => {
      if (s.tableId === tableId) {
        setSnapshot(s);
      }
    });

    return unsubscribe;
  }, [tableId]);

  return snapshot;
}

/**
 * Subscribe to ALL table state updates (for multi-table view).
 * Returns a Map of tableId → latest snapshot.
 */
export function useAllTableStates(): Map<string, TableSnapshot> {
  const [tables, setTables] = useState<Map<string, TableSnapshot>>(new Map());

  useEffect(() => {
    const unsubscribe = window.grindSim.onTableUpdate((snapshot) => {
      setTables(prev => {
        const next = new Map(prev);
        next.set(snapshot.tableId, snapshot);
        return next;
      });
    });

    return unsubscribe;
  }, []);

  return tables;
}
