import { Howl } from 'howler';

// Import all mp3 files
const soundFiles = import.meta.glob<{ default: string }>(
  './sounds/*.mp3',
  { eager: true }
);

type SoundName =
  | 'deal' | 'check' | 'bet' | 'call' | 'raise' | 'fold'
  | 'allin' | 'chips-collect' | 'card-flip'
  | 'timer-tick' | 'timer-warning' | 'your-turn' | 'win';

class SoundManager {
  private sounds: Map<string, Howl> = new Map();
  private masterVolume: number = 0.8;
  private focusedTableId: string | null = null;

  constructor() {
    this.loadSounds();
  }

  private loadSounds(): void {
    for (const [path, module] of Object.entries(soundFiles)) {
      // Extract name from path: "./sounds/deal.mp3" → "deal"
      const match = path.match(/\.\/sounds\/(.+)\.mp3$/);
      if (!match) continue;
      const name = match[1];
      const howl = new Howl({
        src: [module.default],
        preload: true,
        volume: this.masterVolume,
      });
      this.sounds.set(name, howl);
    }
  }

  play(name: string, tableId?: string): void {
    const howl = this.sounds.get(name);
    if (!howl) return;

    // Calculate volume based on focus
    let volume = this.masterVolume;
    if (tableId && this.focusedTableId && tableId !== this.focusedTableId) {
      // Non-focused table: 50% volume, except "your-turn" which is always full
      if (name !== 'your-turn') {
        volume *= 0.5;
      }
    }

    howl.volume(volume);
    howl.play();
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  setFocusedTable(tableId: string | null): void {
    this.focusedTableId = tableId;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }
}

// Singleton
export const soundManager = new SoundManager();
