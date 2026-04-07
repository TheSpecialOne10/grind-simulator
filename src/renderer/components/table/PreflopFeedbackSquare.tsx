import React from 'react';
import type { ActionFrequency } from '../../../shared/types';
import type { PreflopFeedbackState } from '../../hooks/usePreflopFeedback';
import styles from '../../styles/table.module.css';

// PioSolver color scheme
const ACTION_COLORS: Record<string, string> = {
  raise: '#E9967A',
  allIn: '#E9967A',
  call:  '#8FBC8B',
  check: '#8FBC8B',
  fold:  '#6DA2C0',
};

// Order: most aggressive → least aggressive (top to bottom in gradient)
const ACTION_ORDER = ['raise', 'allIn', 'call', 'check', 'fold'] as const;

const ACTION_DISPLAY: Record<string, string> = {
  raise: 'Raise',
  allIn: 'All In',
  call:  'Call',
  check: 'Check',
  fold:  'Fold',
};

const RESULT_ICONS: Record<string, string> = {
  correct: '\u2713',   // ✓
  mixing:  '\u26A0',   // ⚠
  ev_loss: '\u2717',   // ✗
};

const RESULT_COLORS: Record<string, string> = {
  correct: '#44cc66',
  mixing:  '#ffd700',
  ev_loss: '#ff4444',
};

interface Props {
  state: PreflopFeedbackState;
}

export const PreflopFeedbackSquare: React.FC<Props> = ({ state }) => {
  const { data, fading } = state;
  const { canonicalHand, frequencies, result } = data;

  // Build vertical gradient stops and visible action rows (freq > 0)
  const stops: { color: string; pct: number }[] = [];
  const rows: { key: string; label: string; pct: number }[] = [];
  let cursor = 0;

  for (const key of ACTION_ORDER) {
    const f = frequencies[key as keyof ActionFrequency] ?? 0;
    if (f > 0.001) {
      const pct = Math.round(f * 100);
      stops.push({ color: ACTION_COLORS[key], pct: cursor });
      cursor += pct;
      rows.push({ key, label: ACTION_DISPLAY[key], pct });
    }
  }

  // Build CSS linear-gradient (top to bottom to fill the square vertically)
  const gradientParts = stops.map((s, i) => {
    const nextPct = i + 1 < stops.length ? stops[i + 1].pct : 100;
    return `${s.color} ${s.pct}% ${nextPct}%`;
  });
  const gradient = `linear-gradient(to right, ${gradientParts.join(', ')})`;

  const borderClass =
    result === 'correct'  ? styles.feedbackCorrect  :
    result === 'mixing'   ? styles.feedbackMixing   :
                            styles.feedbackEvLoss;

  const outerClass = [
    styles.preflopFeedback,
    borderClass,
    fading ? styles.preflopFeedbackFading : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={outerClass} style={{ background: gradient }}>
      {/* Header: icon + hand name */}
      <div className={styles.feedbackHeader}>
        <span className={styles.feedbackHand}>{canonicalHand}</span>
        <span className={styles.feedbackIcon} style={{ color: RESULT_COLORS[result] }}>
          {RESULT_ICONS[result]}
        </span>
      </div>

      {/* Action frequency rows */}
      <div className={styles.feedbackRows}>
        {rows.map(row => (
          <div key={row.key} className={styles.feedbackRow}>
            <span>{row.label}</span>
            <span>{row.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
