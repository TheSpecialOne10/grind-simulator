import React from 'react';
import type { WinnerInfo } from '../../../shared/types';
import { centsToDollars } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

interface Props {
  winners: WinnerInfo[];
}

export const WinnerOverlay: React.FC<Props> = React.memo(({ winners }) => {
  if (winners.length === 0) return null;

  return (
    <div className={`${styles.winnerOverlay} winner-highlight`}>
      {winners.map((w, i) => (
        <div key={`${w.seatIndex}-${i}`}>
          <div className={styles.winnerText}>
            Winner: {centsToDollars(w.amount)}
          </div>
          {w.handDescription && (
            <div className={styles.winnerHand}>{w.handDescription}</div>
          )}
        </div>
      ))}
    </div>
  );
});
