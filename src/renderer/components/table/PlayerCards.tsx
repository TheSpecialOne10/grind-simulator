import React from 'react';
import type { Card } from '../../../shared/types';
import { CardComponent } from './CardComponent';
import styles from '../../styles/table.module.css';

interface Props {
  holeCards: [Card, Card] | null;
  isHidden: boolean;
  isHero?: boolean;
}

export const PlayerCards: React.FC<Props> = React.memo(({ holeCards, isHidden, isHero }) => {
  if (!holeCards) return null;

  const small = !isHero;
  const containerClass = isHero ? styles.holeCardsHero : styles.holeCards;

  return (
    <div className={containerClass}>
      <CardComponent card={holeCards[0]} faceDown={isHidden} small={small} animate="deal" />
      <CardComponent card={holeCards[1]} faceDown={isHidden} small={small} animate="deal" />
    </div>
  );
});
