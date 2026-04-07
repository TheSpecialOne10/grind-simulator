import React, { useState } from 'react';
import type { Settings as SettingsType, Hotkeys } from '../../../shared/types';
import { DEFAULT_HOTKEYS } from '../../../shared/types';

interface Props {
  settings: SettingsType;
  onUpdate: (settings: Partial<SettingsType>) => void;
  onBack: () => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#a0a0b0', fontSize: 14, marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 14,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: 'none',
  background: '#3366cc', color: '#fff', fontSize: 13, cursor: 'pointer',
};

const sectionTitle: React.CSSProperties = {
  color: '#ffd700', fontSize: 18, fontWeight: 700, marginBottom: 12, marginTop: 24,
};

export const Settings: React.FC<Props> = ({ settings, onUpdate, onBack }) => {
  const [local, setLocal] = useState({ ...settings });
  const [capturingKey, setCapturingKey] = useState<keyof Hotkeys | null>(null);

  const update = (partial: Partial<SettingsType>) => {
    setLocal(prev => ({ ...prev, ...partial }));
    onUpdate(partial);
  };

  const updateHotkey = (key: keyof Hotkeys, value: string) => {
    const newHotkeys = { ...local.hotkeys, [key]: value };
    setLocal(prev => ({ ...prev, hotkeys: newHotkeys }));
    onUpdate({ hotkeys: newHotkeys });
  };

  const handleSelectDir = async (field: 'handHistoryPath' | 'solverDataPath') => {
    const path = await window.grindSim.selectDirectory();
    if (path) update({ [field]: path });
  };

  const handleSelectFile = async () => {
    const path = await window.grindSim.selectFile();
    if (path) update({ solverExecutablePath: path });
  };

  const handleKeyCapture = (e: React.KeyboardEvent, field: keyof Hotkeys) => {
    e.preventDefault();
    e.stopPropagation();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    updateHotkey(field, key);
    setCapturingKey(null);
  };

  const handleMouseCapture = (e: React.MouseEvent, field: keyof Hotkeys) => {
    // Only capture non-left-click (left click is used to activate the capture box)
    if (e.button === 0) return; // Left click activates capture mode, don't bind it
    e.preventDefault();
    e.stopPropagation();
    updateHotkey(field, `mouse${e.button}`);
    setCapturingKey(null);
  };

  const hotkeyEntries: { key: keyof Hotkeys; label: string }[] = [
    { key: 'fold', label: 'Fold' },
    { key: 'checkCall', label: 'Check / Call' },
    { key: 'betRaise', label: 'Bet / Raise' },
    { key: 'preset1', label: 'Preset Size 1' },
    { key: 'preset2', label: 'Preset Size 2' },
    { key: 'preset3', label: 'Preset Size 3' },
    { key: 'preset4', label: 'Preset Size 4' },
  ];

  return (
    <div style={{
      width: '100vw', height: '100vh', background: '#1a1a2e',
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 24px', borderBottom: '1px solid #333',
      }}>
        <button onClick={onBack} style={{ ...btnStyle, background: '#555' }}>
          Back
        </button>
        <h1 style={{ color: '#ffd700', fontSize: 24, fontWeight: 900, margin: 0 }}>
          Settings
        </h1>
      </div>

      {/* Content */}
      <div style={{ padding: '8px 32px 32px', maxWidth: 600 }}>

        {/* ── General ── */}
        <div style={sectionTitle}>General</div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Master Volume: {Math.round(local.masterVolume * 100)}%</label>
          <input
            type="range" min="0" max="100"
            value={Math.round(local.masterVolume * 100)}
            onChange={e => update({ masterVolume: parseInt(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Player Name</label>
          <input
            value={local.playerName}
            onChange={e => update({ playerName: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Hand History Save Path</label>
          <div style={rowStyle}>
            <input value={local.handHistoryPath} readOnly style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => handleSelectDir('handHistoryPath')} style={btnStyle}>Browse</button>
          </div>
        </div>

        {/* ── Solver ── */}
        <div style={sectionTitle}>Solver</div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Solver Executable</label>
          <div style={rowStyle}>
            <input value={local.solverExecutablePath} readOnly style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleSelectFile} style={btnStyle}>Browse</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Solver Data Directory</label>
          <div style={rowStyle}>
            <input value={local.solverDataPath} readOnly style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => handleSelectDir('solverDataPath')} style={btnStyle}>Browse</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Solver Mode</label>
          <div style={rowStyle}>
            <button
              onClick={() => update({ solverMode: 'child_process' })}
              style={{
                ...btnStyle,
                background: local.solverMode === 'child_process' ? '#ffd700' : '#16213e',
                color: local.solverMode === 'child_process' ? '#1a1a2e' : '#fff',
                border: '1px solid #444',
              }}
            >
              Local Process
            </button>
            <button
              onClick={() => update({ solverMode: 'tcp_server' })}
              style={{
                ...btnStyle,
                background: local.solverMode === 'tcp_server' ? '#ffd700' : '#16213e',
                color: local.solverMode === 'tcp_server' ? '#1a1a2e' : '#fff',
                border: '1px solid #444',
              }}
            >
              Remote Server
            </button>
          </div>
        </div>

        {local.solverMode === 'tcp_server' && (
          <div style={{ marginBottom: 16, ...rowStyle }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Host</label>
              <input
                value={local.solverServerHost}
                onChange={e => update({ solverServerHost: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Port</label>
              <input
                type="number"
                value={local.solverServerPort}
                onChange={e => update({ solverServerPort: parseInt(e.target.value) || 5251 })}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* ── Hotkeys ── */}
        <div style={sectionTitle}>Hotkeys</div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
          Click a key box, then press any key or mouse button to assign it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hotkeyEntries.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#a0a0b0', fontSize: 14, width: 140 }}>{label}</span>
              <div
                tabIndex={0}
                onClick={() => { if (capturingKey !== key) setCapturingKey(key); }}
                onKeyDown={e => capturingKey === key && handleKeyCapture(e, key)}
                onMouseDown={e => capturingKey === key && handleMouseCapture(e, key)}
                onContextMenu={e => { if (capturingKey === key) e.preventDefault(); }}
                style={{
                  width: 80, height: 36, borderRadius: 6,
                  background: capturingKey === key ? '#3366cc' : '#2a2a3e',
                  border: capturingKey === key ? '2px solid #ffd700' : '1px solid #444',
                  color: '#fff', fontSize: 16, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', textTransform: 'uppercase',
                  outline: 'none',
                }}
              >
                {capturingKey === key ? '...' : displayKey(local.hotkeys[key])}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => update({ hotkeys: { ...DEFAULT_HOTKEYS } })}
          style={{ ...btnStyle, background: '#555', marginTop: 16 }}
        >
          Reset Hotkeys to Default
        </button>

      </div>
    </div>
  );
};

function displayKey(key: string): string {
  if (key === ' ') return 'SPACE';
  if (key === 'mouse1') return 'M.MID';
  if (key === 'mouse2') return 'M.RIGHT';
  if (key === 'mouse3') return 'M.BACK';
  if (key === 'mouse4') return 'M.FWD';
  if (key.startsWith('mouse')) return 'M.' + key.slice(5);
  if (key.length === 1) return key.toUpperCase();
  return key;
}
