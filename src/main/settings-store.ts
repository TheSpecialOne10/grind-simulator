import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { app } from 'electron';
import type { Settings } from '../shared/types';
import { DEFAULT_HOTKEYS } from '../shared/types';

const DEFAULTS: Settings = {
  masterVolume: 0.8,
  handHistoryPath: '',
  solverDataPath: '',
  solverExecutablePath: '',
  solverMode: 'child_process',
  solverServerHost: 'localhost',
  solverServerPort: 5251,
  playerName: 'Hero',
  hotkeys: { ...DEFAULT_HOTKEYS },
};

function getSettingsPath(): string {
  const userDataPath = app.getPath('userData');
  return join(userDataPath, 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const filePath = getSettingsPath();
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      // Merge with defaults so new fields get default values
      return {
        ...DEFAULTS, ...data,
        hotkeys: { ...DEFAULT_HOTKEYS, ...data.hotkeys },
      };
    }
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: Settings): void {
  try {
    const filePath = getSettingsPath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const current = loadSettings();
  const updated = { ...current, ...partial };
  if (partial.hotkeys) {
    updated.hotkeys = { ...current.hotkeys, ...partial.hotkeys };
  }
  saveSettings(updated);
  return updated;
}
