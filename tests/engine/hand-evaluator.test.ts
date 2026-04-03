import { describe, it, expect } from 'vitest';
import { evaluateHand } from '../../src/main/engine/hand-evaluator';
import type { Card } from '../../src/shared/types';

// Helper to create cards quickly: "Ah" → { rank: 'A', suit: 'h' }
function c(s: string): Card {
  return { rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] };
}
function hand(...cards: string[]): Card[] {
  return cards.map(c);
}

describe('evaluateHand — 5 cards', () => {
  it('detects Royal Flush', () => {
    const result = evaluateHand(hand('Ah', 'Kh', 'Qh', 'Jh', 'Th'));
    expect(result.description).toBe('Royal Flush');
  });

  it('detects Straight Flush', () => {
    const result = evaluateHand(hand('9d', '8d', '7d', '6d', '5d'));
    expect(result.description).toBe('Straight Flush, Nine high');
  });

  it('detects wheel Straight Flush (A-2-3-4-5)', () => {
    const result = evaluateHand(hand('Ac', '2c', '3c', '4c', '5c'));
    expect(result.description).toBe('Straight Flush, Five high');
  });

  it('detects Four of a Kind', () => {
    const result = evaluateHand(hand('As', 'Ah', 'Ad', 'Ac', 'Kh'));
    expect(result.description).toBe('Four of a Kind, Aces');
  });

  it('detects Full House', () => {
    const result = evaluateHand(hand('Ks', 'Kh', 'Kd', 'Ac', 'Ah'));
    expect(result.description).toBe('Full House, Kings full of Aces');
  });

  it('detects Flush', () => {
    const result = evaluateHand(hand('Ah', 'Jh', '8h', '5h', '3h'));
    expect(result.description).toBe('Flush, Ace high');
  });

  it('detects Straight', () => {
    const result = evaluateHand(hand('Td', '9c', '8h', '7s', '6d'));
    expect(result.description).toBe('Straight, Ten high');
  });

  it('detects Wheel straight (A-2-3-4-5)', () => {
    const result = evaluateHand(hand('Ah', '2c', '3d', '4h', '5s'));
    expect(result.description).toBe('Straight, Five high');
  });

  it('detects Three of a Kind', () => {
    const result = evaluateHand(hand('7s', '7h', '7d', 'Ac', 'Kh'));
    expect(result.description).toBe('Three of a Kind, Sevens');
  });

  it('detects Two Pair', () => {
    const result = evaluateHand(hand('As', 'Ah', 'Kd', 'Kc', '5h'));
    expect(result.description).toBe('Two Pair, Aces and Kings');
  });

  it('detects One Pair', () => {
    const result = evaluateHand(hand('Qs', 'Qh', '9d', '5c', '3h'));
    expect(result.description).toBe('Pair of Queens');
  });

  it('detects High Card', () => {
    const result = evaluateHand(hand('Ah', 'Jc', '8d', '5s', '3h'));
    expect(result.description).toBe('High Card, Ace');
  });
});

describe('evaluateHand — ranking order', () => {
  const hands = {
    royalFlush:     hand('Ah', 'Kh', 'Qh', 'Jh', 'Th'),
    straightFlush:  hand('9d', '8d', '7d', '6d', '5d'),
    quads:          hand('As', 'Ah', 'Ad', 'Ac', 'Kh'),
    fullHouse:      hand('Ks', 'Kh', 'Kd', 'Ac', 'Ah'),
    flush:          hand('Ah', 'Jh', '8h', '5h', '3h'),
    straight:       hand('Td', '9c', '8h', '7s', '6d'),
    trips:          hand('7s', '7h', '7d', 'Ac', 'Kh'),
    twoPair:        hand('As', 'Ah', 'Kd', 'Kc', '5h'),
    onePair:        hand('Qs', 'Qh', '9d', '5c', '3h'),
    highCard:       hand('Ah', 'Jc', '8d', '5s', '3h'),
  };

  const ranked = Object.entries(hands).map(([name, cards]) => ({
    name,
    rank: evaluateHand(cards).rank,
  }));

  it('ranks hands in correct order (lower rank = better)', () => {
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].rank).toBeLessThan(ranked[i + 1].rank);
    }
  });
});

describe('evaluateHand — kicker comparison', () => {
  it('pair of Aces with King kicker beats pair of Aces with Queen kicker', () => {
    const akq = evaluateHand(hand('As', 'Ah', 'Kd', '5c', '3h'));
    const aqj = evaluateHand(hand('Ad', 'Ac', 'Qd', '5s', '3d'));
    expect(akq.rank).toBeLessThan(aqj.rank);
  });

  it('higher two pair beats lower two pair', () => {
    const aakk = evaluateHand(hand('As', 'Ah', 'Kd', 'Kc', '5h'));
    const kkqq = evaluateHand(hand('Ks', 'Kh', 'Qd', 'Qc', '5d'));
    expect(aakk.rank).toBeLessThan(kkqq.rank);
  });

  it('same two pair, better kicker wins', () => {
    const aakkq = evaluateHand(hand('As', 'Ah', 'Kd', 'Kc', 'Qh'));
    const aakkj = evaluateHand(hand('Ad', 'Ac', 'Kh', 'Ks', 'Jh'));
    expect(aakkq.rank).toBeLessThan(aakkj.rank);
  });

  it('identical hands have equal rank', () => {
    const a = evaluateHand(hand('As', 'Kh', 'Qd', 'Jc', '9h'));
    const b = evaluateHand(hand('Ah', 'Kd', 'Qc', 'Js', '9d'));
    expect(a.rank).toBe(b.rank);
  });
});

describe('evaluateHand — 7 cards', () => {
  it('finds Royal Flush among 7 cards', () => {
    const result = evaluateHand(hand('Ah', 'Kh', 'Qh', 'Jh', 'Th', '2c', '3d'));
    expect(result.description).toBe('Royal Flush');
  });

  it('finds the best hand from 7 cards', () => {
    // Has both a pair and a flush possible — flush is better
    const result = evaluateHand(hand('Ah', 'Jh', '8h', '5h', '3h', 'As', '2c'));
    expect(result.description).toBe('Flush, Ace high');
  });

  it('finds a straight in 7 cards with other noise', () => {
    const result = evaluateHand(hand('Td', '9c', '8h', '7s', '6d', '2c', '2h'));
    expect(result.description).toBe('Straight, Ten high');
  });

  it('finds full house over flush when both available', () => {
    // 7h 7d 7c Ah Kh Qh 2h - trips + flush cards
    // Best is actually flush Ah Kh Qh 7h 2h (ace high) vs trips 777AK
    // Flush beats trips
    const result = evaluateHand(hand('7h', '7d', '7c', 'Ah', 'Kh', 'Qh', '2h'));
    expect(result.description).toBe('Flush, Ace high');
  });

  it('detects wheel straight in 7 cards', () => {
    const result = evaluateHand(hand('Ah', '2c', '3d', '4h', '5s', 'Kc', 'Qd'));
    expect(result.description).toBe('Straight, Five high');
  });
});

describe('evaluateHand — edge cases', () => {
  it('throws for fewer than 5 cards', () => {
    expect(() => evaluateHand(hand('Ah', 'Kh'))).toThrow();
  });

  it('broadway straight', () => {
    const result = evaluateHand(hand('As', 'Kd', 'Qh', 'Jc', 'Ts'));
    expect(result.description).toBe('Straight, Ace high');
  });

  it('distinguishes straight from straight flush', () => {
    const sf = evaluateHand(hand('6h', '5h', '4h', '3h', '2h'));
    const s = evaluateHand(hand('6h', '5d', '4h', '3h', '2h'));
    expect(sf.rank).toBeLessThan(s.rank);
  });
});
