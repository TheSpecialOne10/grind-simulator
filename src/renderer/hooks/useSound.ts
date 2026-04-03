import { useEffect } from 'react';
import { soundManager } from '../audio/sound-manager';

/**
 * Subscribe to sound trigger events from the main process and play them via Howler.js.
 */
export function useSound(): void {
  useEffect(() => {
    const unsubscribe = window.grindSim.onSoundTrigger((data) => {
      soundManager.play(data.sound, data.tableId);
    });

    return unsubscribe;
  }, []);
}
