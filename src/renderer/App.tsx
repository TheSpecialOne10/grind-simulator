import React, { useState, useCallback, useEffect } from 'react';
import type { Settings, SpotSessionConfig } from '../shared/types';
import { DEFAULT_HOTKEYS } from '../shared/types';
import { PokerTable } from './components/table/PokerTable';
import { Settings as SettingsView } from './components/lobby/Settings';
import { SpotSelector } from './components/lobby/SpotSelector';
import { useTableState } from './hooks/useTableState';
import { useSound } from './hooks/useSound';
import { refreshHotkeyCache } from './hooks/useHotkeys';

export function App(): React.JSX.Element {
  const tableId = window.grindSim.getTableIdFromURL();

  if (tableId) {
    return <TableWindow tableId={tableId} />;
  }

  return <LobbyWindow />;
}

// ── Table Window (one per poker table) ──

function TableWindow({ tableId: initialTableId }: { tableId: string }): React.JSX.Element {
  const [activeTableId, setActiveTableId] = useState(initialTableId);
  const snapshot = useTableState(activeTableId);
  useSound();

  useEffect(() => {
    window.grindSim.signalTableReady(initialTableId);
  }, [initialTableId]);

  // Zoom mode: switch active table when main process redirects hero
  useEffect(() => {
    return window.grindSim.onZoomRedirect(({ tableId }) => {
      console.log(`[ZoomRenderer] ZOOM_REDIRECT received → switching to ${tableId}`);
      setActiveTableId(tableId);
    });
  }, []);

  // Focus this window when mouse hovers so hotkeys go to the table under cursor
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleMouseMove = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => { debounceTimer = null; }, 200);
      if (!document.hasFocus()) {
        window.grindSim.focusWindow();
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  if (!snapshot) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#1a1a2e', color: '#a0a0b0', fontSize: 16,
      }}>
        Waiting for table...
      </div>
    );
  }

  return <PokerTable snapshot={snapshot} humanSeatIndex={0} />;
}

// ── Lobby Window (main window) ──

type LobbyView = 'home' | 'settings' | 'spot-selector';

function LobbyWindow(): React.JSX.Element {
  const [view, setView] = useState<LobbyView>('home');
  const [isPlaying, setIsPlaying] = useState(false);
  const [tableCount, setTableCount] = useState(1);
  const [playerName, setPlayerName] = useState('Hero');
  const [revealBotCards, setRevealBotCards] = useState(false);
  const [zoomMode, setZoomMode] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Load persisted settings from disk on mount
  useEffect(() => {
    window.grindSim.getSettings().then(s => {
      setSettings(s);
      setPlayerName(s.playerName);
      refreshHotkeyCache(s.hotkeys);
    });
  }, []);

  const handleStart = useCallback(() => {
    window.grindSim.startSession({ tableCount, playerName, revealBotCards, zoomMode });
    setIsPlaying(true);
  }, [tableCount, playerName, revealBotCards, zoomMode]);

  const handleStop = useCallback(() => {
    window.grindSim.stopSession();
    setIsPlaying(false);
  }, []);

  const handleStartSpot = useCallback((config: SpotSessionConfig) => {
    window.grindSim.startSpotSession(config);
    setTableCount(config.tableCount);
    setIsPlaying(true);
  }, []);

  const handleSettingsUpdate = (partial: Partial<Settings>) => {
    setSettings(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      if (partial.hotkeys) {
        next.hotkeys = { ...prev.hotkeys, ...partial.hotkeys };
      }
      refreshHotkeyCache(next.hotkeys);
      return next;
    });
    // Persist to disk via main process
    window.grindSim.updateSettings(partial);
    if (partial.playerName !== undefined) {
      setPlayerName(partial.playerName);
    }
  };

  // Settings view (full page)
  if (view === 'settings' && settings) {
    return (
      <SettingsView
        settings={settings}
        onUpdate={handleSettingsUpdate}
        onBack={() => setView('home')}
      />
    );
  }

  // Spot Trainer selector view
  if (view === 'spot-selector') {
    return (
      <SpotSelector
        playerName={playerName}
        onStart={handleStartSpot}
        onBack={() => setView('home')}
      />
    );
  }

  // Session active view
  if (isPlaying) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', gap: 24,
      }}>
        <h1 style={{ color: '#ffd700', fontSize: 36, fontWeight: 900 }}>
          SESSION ACTIVE
        </h1>
        <p style={{ color: '#a0a0b0', fontSize: 16 }}>
          {tableCount} table{tableCount > 1 ? 's' : ''} running
        </p>
        <button
          onClick={handleStop}
          style={{
            padding: '14px 48px', borderRadius: 8, border: 'none',
            background: '#cc3333', color: '#fff', fontSize: 18,
            fontWeight: 900, cursor: 'pointer', letterSpacing: 2,
          }}
        >
          STOP SESSION
        </button>
      </div>
    );
  }

  // Home / lobby view
  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', gap: 24,
    }}>
      <h1 style={{ color: '#ffd700', fontSize: 48, fontWeight: 900, letterSpacing: 4 }}>
        GRIND SIMULATOR
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <label style={{ color: '#a0a0b0', fontSize: 14 }}>
          Player Name
          <input
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            style={{
              display: 'block', marginTop: 4, padding: '6px 12px', borderRadius: 6,
              border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 14, width: 200,
            }}
          />
        </label>

        <label style={{ color: '#a0a0b0', fontSize: 14 }}>
          Tables
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button
                key={n}
                onClick={() => setTableCount(n)}
                style={{
                  width: 36, height: 36, borderRadius: 6, border: 'none',
                  background: n === tableCount ? '#ffd700' : '#16213e',
                  color: n === tableCount ? '#1a1a2e' : '#fff',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a0a0b0', fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={revealBotCards}
            onChange={e => setRevealBotCards(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          Reveal bot hole cards
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a0a0b0', fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={zoomMode}
            onChange={e => setZoomMode(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          Zoom Mode
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button
          onClick={handleStart}
          style={{
            padding: '14px 48px', borderRadius: 8, border: 'none',
            background: '#33aa55', color: '#fff', fontSize: 18,
            fontWeight: 900, cursor: 'pointer', letterSpacing: 2,
          }}
        >
          START GRINDING
        </button>
        <button
          onClick={() => setView('spot-selector')}
          style={{
            padding: '14px 28px', borderRadius: 8, border: 'none',
            background: '#3366cc', color: '#fff', fontSize: 18,
            fontWeight: 900, cursor: 'pointer', letterSpacing: 2,
          }}
        >
          SPOT TRAINER
        </button>
        <button
          onClick={() => setView('settings')}
          style={{
            padding: '14px 20px', borderRadius: 8, border: '1px solid #444',
            background: '#16213e', color: '#a0a0b0', fontSize: 16, cursor: 'pointer',
          }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
