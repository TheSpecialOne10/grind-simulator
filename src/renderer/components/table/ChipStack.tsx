import React from 'react';
import { centsToDollars } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

// Import chip images
const chipImages = import.meta.glob<{ default: string }>(
  '../../assets/table/chip*.png',
  { eager: true }
);

// Pick the best chip image for a given cent amount
function getChipSrc(cents: number): string {
  // Map cent amount to the closest chip denomination file
  // Chip files use dollar values: chip0001 = $1, chip0005 = $5, etc.
  // For our $0.50/$1.00 game, bets are typically $0.50-$100
  const dollarAmount = cents / 100;

  let bestKey = '../../assets/table/chip0001.png'; // default $1 chip

  if (dollarAmount >= 100) bestKey = '../../assets/table/chip0100.png';
  else if (dollarAmount >= 25) bestKey = '../../assets/table/chip0025.png';
  else if (dollarAmount >= 5) bestKey = '../../assets/table/chip0005.png';
  else if (dollarAmount >= 1) bestKey = '../../assets/table/chip0001.png';
  else bestKey = '../../assets/table/chip000001.png'; // smallest

  return chipImages[bestKey]?.default ?? '';
}

interface Props {
  amount: number; // cents
}

export const ChipStack: React.FC<Props> = React.memo(({ amount }) => {
  if (amount <= 0) return null;

  const chipSrc = getChipSrc(amount);

  return (
    <div className={styles.chipStack}>
      {chipSrc && <img src={chipSrc} alt="" className={styles.chipImg} draggable={false} />}
      <span className={styles.chipAmount}>{centsToDollars(amount)}</span>
    </div>
  );
});
