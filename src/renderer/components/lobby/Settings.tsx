import React, { useState } from 'react';
import type { Settings as SettingsType } from '../../../shared/types';
import { DEFAULTS } from '../../../shared/constants';

interface Props {
  settings: SettingsType;
  onUpdate: (settings: Partial<SettingsType>) => void;
  onClose: () => void;
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#a0a0b0', fontSize: 13, marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  border: '1px solid #444', background: '#16213e', color: '#fff', fontSize: 13,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const btnStyle: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 4, border: 'none',
  background: '#3366cc', color: '#fff', fontSize: 12, cursor: 'pointer',
};

export const Settings: React.FC<Props> = ({ settings, onUpdate, onClose }) => {
  const [local, setLocal] = useState({ ...settings });

  const update = (partial: Partial<SettingsType>) => {
    setLocal(prev => ({ ...prev, ...partial }));
    onUpdate(partial);
  };

  const handleSelectDir = async (field: 'handHistoryPath' | 'solverDataPath') => {
    const path = await window.grindSim.selectDirectory();
    if (path) update({ [field]: path });
  };

  const handleSelectFile = async () => {
    const path = await window.grindSim.selectFile();
    if (path) update({ solverExecutablePath: path });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: '#1a1a2e', borderRadius: 12, padding: 24, width: 420,
        border: '1px solid #333', maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: '#ffd700', fontSize: 20, margin: 0 }}>Settings</h2>
          <button onClick={onClose} style={{ ...btnStyle, background: '#cc3333' }}>Close</button>
        </div>

        {/* Volume */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Master Volume: {Math.round(local.masterVolume * 100)}%</label>
          <input
            type="range" min="0" max="100"
            value={Math.round(local.masterVolume * 100)}
            onChange={e => update({ masterVolume: parseInt(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Player Name */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Player Name</label>
          <input
            value={local.playerName}
            onChange={e => update({ playerName: e.target.value })}
            style={inputStyle}
          />
        </div>

        {/* Hand History Path */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Hand History Save Path</label>
          <div style={rowStyle}>
            <input value={local.handHistoryPath} readOnly style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => handleSelectDir('handHistoryPath')} style={btnStyle}>Browse</button>
          </div>
        </div>

        {/* Solver Executable */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Solver Executable</label>
          <div style={rowStyle}>
            <input value={local.solverExecutablePath} readOnly style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleSelectFile} style={btnStyle}>Browse</button>
          </div>
        </div>

        {/* Solver Data Path */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Solver Data Directory</label>
          <div style={rowStyle}>
            <input value={local.solverDataPath} readOnly style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => handleSelectDir('solverDataPath')} style={btnStyle}>Browse</button>
          </div>
        </div>

        {/* Solver Mode */}
        <div style={sectionStyle}>
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

        {/* Server settings (only in TCP mode) */}
        {local.solverMode === 'tcp_server' && (
          <div style={sectionStyle}>
            <div style={{ ...rowStyle, marginBottom: 8 }}>
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
          </div>
        )}
      </div>
    </div>
  );
};
