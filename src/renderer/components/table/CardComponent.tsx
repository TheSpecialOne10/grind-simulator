import React from 'react';
import type { Card } from '../../../shared/types';
import styles from '../../styles/table.module.css';

interface Props {
  card: Card | null;
  faceDown?: boolean;
  small?: boolean;
  animate?: 'deal' | 'flip';
}

// Import card face PNGs (card_{rank}{suit}.png)
const cardImages = import.meta.glob<{ default: string }>(
  '../../assets/cards/card_*.png',
  { eager: true }
);

// Import card back from table assets
const tableImages = import.meta.glob<{ default: string }>(
  '../../assets/table/downcards2*.png',
  { eager: true }
);

function getCardSrc(card: Card): string {
  const key = `../../assets/cards/card_${card.rank}${card.suit}.png`;
  return cardImages[key]?.default ?? '';
}

function getBackSrc(small?: boolean): string {
  const key = small
    ? '../../assets/table/downcards2-sm.png'
    : '../../assets/table/downcards2.png';
  return tableImages[key]?.default ?? '';
}

export const CardComponent: React.FC<Props> = React.memo(({ card, faceDown, small, animate }) => {
  const src = faceDown || !card ? getBackSrc(small) : getCardSrc(card);
  const sizeClass = small ? styles.cardSmall : '';
  const animClass = animate === 'deal' ? 'deal-card-enter' : animate === 'flip' ? 'flip-card-enter' : '';

  return (
    <div className={`${styles.card} ${sizeClass} ${animClass}`}>
      <img src={src} alt={card && !faceDown ? `${card.rank}${card.suit}` : 'card back'} draggable={false} />
    </div>
  );
});
