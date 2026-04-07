import React from 'react';
import { centsToDollars } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

// Import chip images
const chipImages = import.meta.glob<{ default: string }>(
  '../../assets/table/chip*.png',
  { eager: true }
);

// Denominations in cents (descending) mapped to asset paths
const DENOMINATIONS: { cents: number; key: string }[] = [
  { cents: 10000, key: '../../assets/table/chip0100.png' },
  { cents: 2500,  key: '../../assets/table/chip0025.png' },
  { cents: 500,   key: '../../assets/table/chip0005.png' },
  { cents: 100,   key: '../../assets/table/chip0001.png' },
  { cents: 25,    key: '../../assets/table/chip000025.png' },
];

const MAX_CHIPS = 8;
const CHIP_OFFSET = 4; // px between stacked chips

interface ChipEntry {
  src: string;
  cents: number;
}

function breakdownChips(amount: number): ChipEntry[] {
  const chips: ChipEntry[] = [];
  let remaining = amount;

  for (const denom of DENOMINATIONS) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / denom.cents);
    if (count > 0) {
      const src = chipImages[denom.key]?.default ?? '';
      for (let i = 0; i < count; i++) {
        chips.push({ src, cents: denom.cents });
      }
      remaining -= count * denom.cents;
    }
  }

  // If too many chips, keep only the largest denominations
  if (chips.length > MAX_CHIPS) {
    chips.length = MAX_CHIPS;
  }

  // Ensure at least one chip for any positive amount
  if (chips.length === 0 && amount > 0) {
    const smallest = DENOMINATIONS[DENOMINATIONS.length - 1];
    chips.push({ src: chipImages[smallest.key]?.default ?? '', cents: smallest.cents });
  }

  return chips;
}

interface Props {
  amount: number; // cents
}

export const ChipStack: React.FC<Props> = React.memo(({ amount }) => {
  if (amount <= 0) return null;

  const chips = breakdownChips(amount);
  const stackHeight = 25 + (chips.length - 1) * CHIP_OFFSET;

  return (
    <div className={styles.chipStack}>
      <div className={styles.chipPile} style={{ height: stackHeight }}>
        {chips.map((chip, i) => (
          <img
            key={i}
            src={chip.src}
            alt=""
            className={styles.chipLayer}
            style={{ bottom: i * CHIP_OFFSET, zIndex: i }}
            draggable={false}
          />
        ))}
      </div>
      <span className={styles.chipAmount}>{centsToDollars(amount)}</span>
    </div>
  );
});
