import type { Card, HandEvalResult } from '../../shared/types';
import { RANK_VALUES, HAND_CATEGORIES } from '../../shared/constants';

/**
 * Evaluate a poker hand (5, 6, or 7 cards).
 * For >5 cards, finds the best 5-card combination.
 * Returns a numeric rank (lower = better), description, and best 5 cards.
 */
export function evaluateHand(cards: Card[]): HandEvalResult {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards, got ${cards.length}`);
  }
  if (cards.length === 5) {
    return evaluate5(cards as [Card, Card, Card, Card, Card]);
  }

  // Evaluate all C(n,5) combinations, keep the best
  const combos = combinations5(cards);
  let best: HandEvalResult | null = null;
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (best === null || result.rank < best.rank) {
      best = result;
    }
  }
  return best!;
}

/** Generate all 5-card combinations from an array of cards. */
function combinations5(cards: Card[]): [Card, Card, Card, Card, Card][] {
  const result: [Card, Card, Card, Card, Card][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return result;
}

/** Evaluate exactly 5 cards. */
function evaluate5(cards: [Card, Card, Card, Card, Card]): HandEvalResult {
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(values);
  const isWheel = checkWheel(values);

  // Count rank frequencies
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const freqs = [...counts.entries()].sort((a, b) => {
    // Sort by frequency desc, then by rank value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Determine hand category
  const pattern = freqs.map(f => f[1]).join('');

  if (isFlush && isStraight) {
    if (values[0] === 14 && values[1] === 13) {
      return makeResult(HAND_CATEGORIES.ROYAL_FLUSH, cards, values, 'Royal Flush');
    }
    const highCard = isStraight ? values[0] : 5; // wheel
    return makeResult(
      HAND_CATEGORIES.STRAIGHT_FLUSH, cards,
      isStraight ? values : [5, 4, 3, 2, 1],
      `Straight Flush, ${rankName(highCard)} high`
    );
  }

  if (isFlush && isWheel) {
    return makeResult(HAND_CATEGORIES.STRAIGHT_FLUSH, cards, [5, 4, 3, 2, 1], 'Straight Flush, Five high');
  }

  if (pattern === '41') {
    return makeResult(HAND_CATEGORIES.FOUR_OF_A_KIND, cards,
      freqs.map(f => f[0]),
      `Four of a Kind, ${rankNamePlural(freqs[0][0])}`);
  }

  if (pattern === '32') {
    return makeResult(HAND_CATEGORIES.FULL_HOUSE, cards,
      freqs.map(f => f[0]),
      `Full House, ${rankNamePlural(freqs[0][0])} full of ${rankNamePlural(freqs[1][0])}`);
  }

  if (isFlush) {
    return makeResult(HAND_CATEGORIES.FLUSH, cards, values,
      `Flush, ${rankName(values[0])} high`);
  }

  if (isStraight) {
    return makeResult(HAND_CATEGORIES.STRAIGHT, cards, values,
      `Straight, ${rankName(values[0])} high`);
  }

  if (isWheel) {
    return makeResult(HAND_CATEGORIES.STRAIGHT, cards, [5, 4, 3, 2, 1],
      'Straight, Five high');
  }

  if (pattern === '311') {
    return makeResult(HAND_CATEGORIES.THREE_OF_A_KIND, cards,
      freqs.map(f => f[0]),
      `Three of a Kind, ${rankNamePlural(freqs[0][0])}`);
  }

  if (pattern === '221') {
    return makeResult(HAND_CATEGORIES.TWO_PAIR, cards,
      freqs.map(f => f[0]),
      `Two Pair, ${rankNamePlural(freqs[0][0])} and ${rankNamePlural(freqs[1][0])}`);
  }

  if (pattern === '2111') {
    return makeResult(HAND_CATEGORIES.ONE_PAIR, cards,
      freqs.map(f => f[0]),
      `Pair of ${rankNamePlural(freqs[0][0])}`);
  }

  // High card
  return makeResult(HAND_CATEGORIES.HIGH_CARD, cards, values,
    `High Card, ${rankName(values[0])}`);
}

/** Check for a standard straight (not wheel). Values must be sorted desc. */
function checkStraight(values: number[]): boolean {
  for (let i = 0; i < 4; i++) {
    if (values[i] - values[i + 1] !== 1) return false;
  }
  return true;
}

/** Check for A-2-3-4-5 wheel. Values must be sorted desc. */
function checkWheel(values: number[]): boolean {
  return values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2;
}

/**
 * Build a numeric rank for comparison.
 * Format: category * 10^10 + kicker encoding
 * Lower rank = better hand.
 */
function makeResult(
  category: number,
  cards: [Card, Card, Card, Card, Card],
  kickers: number[],
  description: string
): HandEvalResult {
  // Encode: category in highest digits, then up to 5 kicker values
  // Each kicker gets 2 digits (values 2-14)
  let rank = category * 100_00_00_00_00;
  for (let i = 0; i < kickers.length && i < 5; i++) {
    // Invert kicker so higher cards = lower rank number
    const invertedKicker = 14 - kickers[i];
    rank += invertedKicker * Math.pow(100, 4 - i);
  }

  return { rank, description, bestFiveCards: [...cards] };
}

function rankName(value: number): string {
  const names: Record<number, string> = {
    14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
    9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
    4: 'Four', 3: 'Three', 2: 'Two', 1: 'Ace'
  };
  return names[value] ?? String(value);
}

function rankNamePlural(value: number): string {
  const names: Record<number, string> = {
    14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens',
    9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives',
    4: 'Fours', 3: 'Threes', 2: 'Twos'
  };
  return names[value] ?? String(value);
}
