import React from 'react';
import { centsToDollars } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

interface Props {
  pot: number; // cents
}

export const Pot: React.FC<Props> = React.memo(({ pot }) => {
  if (pot <= 0) return null;

  return (
    <div className={styles.potDisplay}>
      <div className={styles.potAmount}>Pot: {centsToDollars(pot)}</div>
    </div>
  );
});
