import React, { useEffect, useRef, useState } from 'react';
import { ACTION_TIMEOUT_SECONDS } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

interface Props {
  timeRemaining: number;
  seatIndex: number;
  isActive: boolean;
}

const SHOW_AFTER_SECONDS = 10;

function getBarColor(fraction: number): string {
  const hue = Math.round(fraction * 120);
  return `hsl(${hue}, 85%, 50%)`;
}

export const Timer: React.FC<Props> = React.memo(({ timeRemaining, seatIndex, isActive }) => {
  const [time, setTime] = useState(timeRemaining);
  const prevActiveRef = useRef(isActive);

  // Reset timer when this seat becomes the active actor
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setTime(ACTION_TIMEOUT_SECONDS);
    }
    prevActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setTime(t => Math.max(0, t - 0.1));
    }, 100);
    return () => clearInterval(interval);
  }, [isActive]);

  const elapsed = ACTION_TIMEOUT_SECONDS - time;
  const visible = isActive && time > 0 && elapsed >= SHOW_AFTER_SECONDS;

  const visibleDuration = ACTION_TIMEOUT_SECONDS - SHOW_AFTER_SECONDS;
  const fraction = Math.max(0, Math.min(1, time / visibleDuration));
  const barColor = getBarColor(fraction);

  // Always render the container to preserve layout; use opacity to show/hide
  return (
    <div className={styles.timerBar} style={{ opacity: visible ? 1 : 0 }}>
      <div
        className={styles.timerBarFill}
        style={{
          width: visible ? `${fraction * 100}%` : '100%',
          backgroundColor: visible ? barColor : 'transparent',
        }}
      />
    </div>
  );
});
