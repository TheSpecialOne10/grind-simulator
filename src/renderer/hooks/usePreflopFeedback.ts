import { useState, useEffect, useRef } from 'react';
import type { PreflopFeedbackData } from '../../shared/types';

const DISPLAY_MS = 4000;
const FADE_MS = 400;

export interface PreflopFeedbackState {
  data: PreflopFeedbackData;
  fading: boolean;
}

function clearTimers(
  dismissTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  fadeTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
): void {
  if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
  if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; }
}

export function usePreflopFeedback(tableId: string, handId?: string): PreflopFeedbackState | null {
  const [state, setState] = useState<PreflopFeedbackState | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackHandId = useRef<string | null>(null);

  // Clear stale feedback when a new hand starts
  useEffect(() => {
    if (handId && feedbackHandId.current && handId !== feedbackHandId.current) {
      clearTimers(dismissTimer, fadeTimer);
      setState(null);
      feedbackHandId.current = null;
    }
  }, [handId]);

  useEffect(() => {
    // Clear feedback immediately when we switch tables (zoom redirect)
    const unsubZoom = window.grindSim.onZoomRedirect(() => {
      clearTimers(dismissTimer, fadeTimer);
      setState(null);
      feedbackHandId.current = null;
    });

    const unsubFeedback = window.grindSim.onPreflopFeedback((data) => {
      // null = clear signal from main process (e.g. zoom redirect)
      if (data === null) {
        clearTimers(dismissTimer, fadeTimer);
        setState(null);
        feedbackHandId.current = null;
        return;
      }

      clearTimers(dismissTimer, fadeTimer);
      setState({ data, fading: false });
      feedbackHandId.current = handId ?? null;

      fadeTimer.current = setTimeout(() => {
        setState(prev => prev ? { ...prev, fading: true } : null);
      }, DISPLAY_MS - FADE_MS);

      dismissTimer.current = setTimeout(() => {
        setState(null);
        feedbackHandId.current = null;
      }, DISPLAY_MS);
    });

    return () => {
      unsubZoom();
      unsubFeedback();
      clearTimers(dismissTimer, fadeTimer);
    };
  }, [tableId]);

  return state;
}
