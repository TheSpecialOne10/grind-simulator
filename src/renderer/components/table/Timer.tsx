import React, { useEffect, useState } from 'react';
import { ACTION_TIMEOUT_SECONDS } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

interface Props {
  timeRemaining: number; // seconds (from snapshot, always starts at 30)
  seatIndex: number;
  isActive: boolean;
}

const SHOW_AFTER_SECONDS = 10; // Bar appears after 10s elapsed (20s remaining)

/**
 * Compute a continuous gradient color from green → yellow → orange → red
 * based on fraction remaining (1.0 = full, 0.0 = empty).
 */
function getBarColor(fraction: number): string {
  // fraction: 1.0 (full/green) → 0.0 (empty/red)
  // Map to hue: 120 (green) → 60 (yellow) → 30 (orange) → 0 (red)
  const hue = Math.round(fraction * 120); // 120=green, 0=red
  return `hsl(${hue}, 85%, 50%)`;
}

export const Timer: React.FC<Props> = React.memo(({ timeRemaining, seatIndex, isActive }) => {
  const [time, setTime] = useState(timeRemaining);

  useEffect(() => {
    setTime(timeRemaining);
  }, [timeRemaining]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setTime(t => Math.max(0, t - 0.1));
    }, 100);
    return () => clearInterval(interval);
  }, [isActive]);

  // Only show after SHOW_AFTER_SECONDS have elapsed
  // timeRemaining starts at ACTION_TIMEOUT_SECONDS (30)
  // elapsed = 30 - time. Show when elapsed >= 10, i.e. time <= 20
  const elapsed = ACTION_TIMEOUT_SECONDS - time;
  if (!isActive || time <= 0 || elapsed < SHOW_AFTER_SECONDS) return null;

  // Fraction of visible bar remaining (when it appears, it's 2/3 full = 20s left out of 30)
  // Map time from [20..0] to fraction [1.0..0.0]
  const visibleDuration = ACTION_TIMEOUT_SECONDS - SHOW_AFTER_SECONDS; // 20s
  const fraction = Math.max(0, Math.min(1, time / visibleDuration));

  const barColor = getBarColor(fraction);

  return (
    <div className={styles.timerBar}>
      <div
        className={styles.timerBarFill}
        style={{
          width: `${fraction * 100}%`,
          backgroundColor: barColor,
        }}
      />
    </div>
  );
});
