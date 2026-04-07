import { useEffect, useCallback, useState } from 'react';
import type { Hotkeys, AvailableAction } from '../../shared/types';
import { DEFAULT_HOTKEYS } from '../../shared/types';

// Cache hotkeys in memory so we don't IPC on every keypress
let cachedHotkeys: Hotkeys = { ...DEFAULT_HOTKEYS };
let hotkeysLoaded = false;

async function loadHotkeys(): Promise<Hotkeys> {
  if (hotkeysLoaded) return cachedHotkeys;
  try {
    const settings = await window.grindSim.getSettings();
    cachedHotkeys = { ...DEFAULT_HOTKEYS, ...settings.hotkeys };
    hotkeysLoaded = true;
  } catch {}
  return cachedHotkeys;
}

// Called when settings are updated to refresh the cache
export function refreshHotkeyCache(hotkeys: Hotkeys): void {
  cachedHotkeys = { ...DEFAULT_HOTKEYS, ...hotkeys };
  hotkeysLoaded = true;
}

interface HotkeyActions {
  tableId: string;
  actions: AvailableAction[] | null;
  zoomEarlyFold?: boolean;
}

function matchHotkey(input: string, hotkeys: Hotkeys, actions: AvailableAction[], tableId: string): boolean {
  const foldAction = actions.find(a => a.type === 'fold');
  const checkAction = actions.find(a => a.type === 'check');
  const callAction = actions.find(a => a.type === 'call');
  const aggroAction = actions.find(a => a.type === 'bet' || a.type === 'raise');

  if (input === hotkeys.fold && foldAction) {
    window.grindSim.sendAction(tableId, 'fold', 0, '');
    return true;
  }
  if (input === hotkeys.checkCall) {
    if (callAction) { window.grindSim.sendAction(tableId, 'call', callAction.amount, ''); return true; }
    if (checkAction) { window.grindSim.sendAction(tableId, 'check', 0, ''); return true; }
  }
  if (input === hotkeys.betRaise && aggroAction) {
    document.dispatchEvent(new CustomEvent('grindSim:betRaise'));
    return true;
  }
  if (input === hotkeys.preset1) { document.dispatchEvent(new CustomEvent('grindSim:preset', { detail: 0 })); return true; }
  if (input === hotkeys.preset2) { document.dispatchEvent(new CustomEvent('grindSim:preset', { detail: 1 })); return true; }
  if (input === hotkeys.preset3) { document.dispatchEvent(new CustomEvent('grindSim:preset', { detail: 2 })); return true; }
  if (input === hotkeys.preset4) { document.dispatchEvent(new CustomEvent('grindSim:preset', { detail: 3 })); return true; }

  return false;
}

export function useHotkeys({ tableId, actions, zoomEarlyFold }: HotkeyActions): void {
  // Load hotkeys on mount
  useEffect(() => {
    loadHotkeys();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // Zoom early fold: fold hotkey works even when it's not hero's turn
    if (!actions && zoomEarlyFold && key === cachedHotkeys.fold) {
      window.grindSim.zoomFoldEarly(tableId);
      return;
    }

    if (!actions || actions.length === 0) return;
    matchHotkey(key, cachedHotkeys, actions, tableId);
  }, [tableId, actions, zoomEarlyFold]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!actions || actions.length === 0) return;
    if (e.button === 0) return;
    const input = `mouse${e.button}`;
    if (matchHotkey(input, cachedHotkeys, actions, tableId)) {
      e.preventDefault();
    }
  }, [tableId, actions]);

  useEffect(() => {
    const preventContextMenu = (e: Event) => {
      if (Object.values(cachedHotkeys).includes('mouse2')) e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', preventContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [handleKeyDown, handleMouseDown]);
}
