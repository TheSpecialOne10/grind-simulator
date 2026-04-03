import React from 'react';
import type { Card } from '../../../shared/types';
import { CardComponent } from './CardComponent';
import styles from '../../styles/table.module.css';

interface Props {
  cards: Card[];
}

export const CommunityCards: React.FC<Props> = React.memo(({ cards }) => {
  if (cards.length === 0) return null;

  return (
    <div className={styles.communityCards}>
      {cards.map((card, i) => (
        <CardComponent key={`${card.rank}${card.suit}`} card={card} animate="flip" />
      ))}
    </div>
  );
});
