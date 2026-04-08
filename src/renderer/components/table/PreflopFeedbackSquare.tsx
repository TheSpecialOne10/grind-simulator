import React from 'react';
import type { ActionFrequency } from '../../../shared/types';
import type { PreflopFeedbackState } from '../../hooks/usePreflopFeedback';
import styles from '../../styles/table.module.css';

// PioSolver color scheme
const ACTION_COLORS: Record<string, string> = {
  raise: '#E9967A',
  allIn: '#E9967A',
  bet:   '#E9967A',
  call:  '#8FBC8B',
  check: '#8FBC8B',
  fold:  '#6DA2C0',
};

// Order: most aggressive → least aggressive (top to bottom in gradient)
const ACTION_ORDER = ['raise', 'allIn', 'bet', 'call', 'check', 'fold'] as const;

const ACTION_DISPLAY: Record<string, string> = {
  raise: 'Raise',
  allIn: 'All In',
  bet:   'Bet',
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

/** Convert API action to display label with pot % for bets/raises */
function formatActionLabel(label: string, type: string, increment?: number, potChips?: number): string {
  if ((type === 'bet' || type === 'raise') && increment != null && potChips && potChips > 0) {
    const pct = Math.round((increment / potChips) * 100);
    return `${type === 'raise' ? 'Raise' : 'Bet'} ${pct}%`;
  }
  return ACTION_DISPLAY[type] ?? label;
}

interface Props {
  state: PreflopFeedbackState;
}

export const PreflopFeedbackSquare: React.FC<Props> = ({ state }) => {
  const { data, fading } = state;
  const { canonicalHand, frequencies, result, heroAction, detailedActions, potChips } = data;

  // Build rows from detailedActions (postflop, per-sizing) or frequencies (preflop)
  type Row = { key: string; label: string; pct: number; color: string; isHero: boolean };
  let rows: Row[];

  if (detailedActions && detailedActions.length > 0) {
    // Postflop: show each individual sizing (bet_33, bet_67, etc.)
    rows = detailedActions
      .filter(a => a.frequency > 0.001)
      .map(a => ({
        key: a.label,
        label: formatActionLabel(a.label, a.type, a.increment, potChips),
        pct: Math.round(a.frequency * 100),
        color: ACTION_COLORS[a.type] ?? '#888',
        isHero: a.type === heroAction,
      }));
  } else {
    // Preflop: use collapsed frequencies
    rows = [];
    for (const key of ACTION_ORDER) {
      const f = frequencies[key as keyof ActionFrequency] ?? 0;
      if (f > 0.001) {
        rows.push({
          key,
          label: ACTION_DISPLAY[key],
          pct: Math.round(f * 100),
          color: ACTION_COLORS[key],
          isHero: key === heroAction,
        });
      }
    }
  }

  // Build gradient from rows
  let cursor = 0;
  const stops = rows.map(r => {
    const start = cursor;
    cursor += r.pct;
    return { color: r.color, start, end: cursor };
  });
  const gradientParts = stops.map(s => `${s.color} ${s.start}% ${s.end}%`);
  const gradient = stops.length > 0
    ? `linear-gradient(to right, ${gradientParts.join(', ')})`
    : '#333';

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

      {/* Action frequency rows — hero's action highlighted */}
      <div className={styles.feedbackRows}>
        {rows.map(row => (
          <div key={row.key} className={styles.feedbackRow}
               style={row.isHero ? { fontWeight: 700 } : undefined}>
            <span>{row.label}</span>
            <span>{row.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
