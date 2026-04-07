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
      {Array.from({ length: 5 }, (_, i) =>
        cards[i]
          ? <CardComponent key={`${cards[i].rank}${cards[i].suit}`} card={cards[i]} animate="flip" />
          : <div key={`empty-${i}`} className={styles.card} style={{ visibility: 'hidden' }} />
      )}
    </div>
  );
});
