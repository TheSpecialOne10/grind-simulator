import { useState, useEffect, useRef } from 'react';
import type { PostflopFeedbackData } from '../../shared/types';

const DISPLAY_MS = 4000;
const FADE_MS = 400;

export interface PostflopFeedbackState {
  data: PostflopFeedbackData;
  fading: boolean;
}

function clearTimers(
  dismissTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  fadeTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
): void {
  if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
  if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; }
}

/**
 * Subscribe to postflop GTO feedback events in Spot Trainer mode.
 * Mirrors usePreflopFeedback — shows for 4s then fades over 0.4s.
 */
export function usePostflopFeedback(tableId: string, handId?: string): PostflopFeedbackState | null {
  const [state, setState] = useState<PostflopFeedbackState | null>(null);
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
    // Clear on zoom redirect (just in case)
    const unsubZoom = window.grindSim.onZoomRedirect(() => {
      clearTimers(dismissTimer, fadeTimer);
      setState(null);
      feedbackHandId.current = null;
    });

    const unsubFeedback = window.grindSim.onPostflopFeedback((data) => {
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
