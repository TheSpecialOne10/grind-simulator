import React, { useState, useCallback, useEffect } from 'react';
import type { Settings } from '../shared/types';
import { PokerTable } from './components/table/PokerTable';
import { Settings as SettingsPanel } from './components/lobby/Settings';
import { useTableState } from './hooks/useTableState';
import { useSound } from './hooks/useSound';

export function App(): React.JSX.Element {
  // Check if this is a table window (has tableId in URL)
  const tableId = window.grindSim.getTableIdFromURL();

  if (tableId) {
    return <TableWindow tableId={tableId} />;
  }

  return <LobbyWindow />;
}

// ── Table Window (one per poker table) ──

function TableWindow({ tableId }: { tableId: string }): React.JSX.Element {
  const snapshot = useTableState(tableId);
  useSound();

  // Signal to main process that this renderer is mounted and ready for snapshots
  useEffect(() => {
    window.grindSim.signalTableReady(tableId);
  }, [tableId]);

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

function LobbyWindow(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false);
  const [tableCount, setTableCount] = useState(1);
  const [playerName, setPlayerName] = useState('Hero');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    masterVolume: 0.8,
    handHistoryPath: '',
    solverDataPath: '',
    solverExecutablePath: '',
    solverMode: 'child_process',
    solverServerHost: 'localhost',
    solverServerPort: 5251,
    playerName: 'Hero',
  });

  const handleStart = useCallback(() => {
    window.grindSim.startSession({ tableCount, playerName });
    setIsPlaying(true);
  }, [tableCount, playerName]);

  const handleStop = useCallback(() => {
    window.grindSim.stopSession();
    setIsPlaying(false);
  }, []);

  const handleSettingsUpdate = (partial: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
    window.grindSim.updateSettings(partial);
    if (partial.playerName !== undefined) {
      setPlayerName(partial.playerName);
    }
  };

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
          onClick={() => setShowSettings(true)}
          style={{
            padding: '14px 20px', borderRadius: 8, border: '1px solid #444',
            background: '#16213e', color: '#a0a0b0', fontSize: 16, cursor: 'pointer',
          }}
        >
          Settings
        </button>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={handleSettingsUpdate}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
