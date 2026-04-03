import React, { useState } from 'react';
import { centsToDollars, BB_CENTS } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

interface Props {
  tableId: string;
  pot: number;        // cents
  toCall: number;     // cents (0 if no bet to face)
  minBet: number;     // cents
  maxBet: number;     // cents (all-in)
}

const PRESETS = [0.33, 0.5, 0.67, 0.75, 1.0];

export const FallbackSlider: React.FC<Props> = ({ tableId, pot, toCall, minBet, maxBet }) => {
  const [betSize, setBetSize] = useState(minBet);
  const isFacingBet = toCall > 0;

  const handleFold = () => {
    window.grindSim.sendAction(tableId, 'fold', 0, '');
  };

  const handleCheckCall = () => {
    if (isFacingBet) {
      window.grindSim.sendAction(tableId, 'call', toCall, '');
    } else {
      window.grindSim.sendAction(tableId, 'check', 0, '');
    }
  };

  const handleBetRaise = () => {
    const type = isFacingBet ? 'raise' : 'bet';
    window.grindSim.sendAction(tableId, type, betSize, '');
  };

  const handlePreset = (fraction: number) => {
    const size = Math.max(minBet, Math.min(Math.round(pot * fraction), maxBet));
    setBetSize(size);
  };

  const handleAllIn = () => {
    setBetSize(maxBet);
  };

  return (
    <div className={styles.sliderContainer}>
      <div className={styles.presetButtons}>
        {PRESETS.map(pct => (
          <button
            key={pct}
            className={styles.presetBtn}
            onClick={() => handlePreset(pct)}
          >
            {Math.round(pct * 100)}%
          </button>
        ))}
        <button className={styles.presetBtn} onClick={handleAllIn}>ALL-IN</button>
      </div>

      <div className={styles.actionBar}>
        {isFacingBet && (
          <button className={`${styles.actionBtn} ${styles.btnFold}`} onClick={handleFold}>
            FOLD
          </button>
        )}
        <button className={`${styles.actionBtn} ${styles.btnCall}`} onClick={handleCheckCall}>
          {isFacingBet ? `CALL ${centsToDollars(toCall)}` : 'CHECK'}
        </button>
        {maxBet > 0 && (
          <button className={`${styles.actionBtn} ${styles.btnRaise}`} onClick={handleBetRaise}>
            {isFacingBet ? 'RAISE' : 'BET'} {centsToDollars(betSize)}
          </button>
        )}
      </div>
    </div>
  );
};
