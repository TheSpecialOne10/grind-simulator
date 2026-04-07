import { useEffect, useRef, useState } from 'react';
import type { TableSnapshot } from '../../shared/types';

// Module-level cache shared across all hook instances in the same window.
// Populated by a single persistent subscription set up on first use.
const snapshotCache = new Map<string, TableSnapshot>();
let globalSubscribed = false;
const listeners = new Set<() => void>();

function ensureSubscribed(): void {
  if (globalSubscribed) return;
  globalSubscribed = true;
  window.grindSim.onTableUpdate((s) => {
    snapshotCache.set(s.tableId, s);
    listeners.forEach(fn => fn());
  });
}

/**
 * Subscribe to table state updates via IPC.
 * Uses a module-level cache so zoom redirects (tableId changes mid-session)
 * immediately serve the last known snapshot for the new tableId.
 */
export function useTableState(tableId: string | null): TableSnapshot | null {
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(
    tableId ? (snapshotCache.get(tableId) ?? null) : null
  );
  const tableIdRef = useRef(tableId);
  tableIdRef.current = tableId;

  useEffect(() => {
    ensureSubscribed();

    // Serve immediately from cache if available (handles zoom redirect timing)
    if (tableId) {
      const cached = snapshotCache.get(tableId);
      if (cached) setSnapshot(cached);
      else setSnapshot(null);
    }

    const notify = () => {
      if (!tableIdRef.current) return;
      const s = snapshotCache.get(tableIdRef.current);
      if (s) setSnapshot(s);
    };

    listeners.add(notify);
    return () => { listeners.delete(notify); };
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
    const unsubscribe = window.grindSim.onTableUpdate((s) => {
      setTables(prev => {
        const next = new Map(prev);
        next.set(s.tableId, s);
        return next;
      });
    });
    return unsubscribe;
  }, []);

  return tables;
}
