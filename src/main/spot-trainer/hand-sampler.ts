import { webcrypto } from 'node:crypto';
import type { Card, Rank, Suit } from '../../shared/types';
import { RANKS, SUITS } from '../../shared/constants';
import type { PreflopCharts } from '../bot/preflop-charts';
import type { RangeRef } from './spot-config';

// ── Types ──

interface WeightedCombo {
  cards: [Card, Card];
  weight: number;
}

// ── Card utilities ──

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/** All 52 cards as a flat array. */
function allCards(): Card[] {
  const cards: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

// ── Canonical hand → concrete combo expansion ──

/**
 * Parse a canonical hand string ("AA", "AKs", "AKo") into
 * (highRank, lowRank, type) where type is 'pair' | 'suited' | 'offsuit'.
 */
function parseCanonical(hand: string): {
  highRank: Rank;
  lowRank: Rank;
  type: 'pair' | 'suited' | 'offsuit';
} | null {
  if (hand.length === 2) {
    // Pocket pair: "AA", "KK", etc.
    const r = hand[0] as Rank;
    return { highRank: r, lowRank: r, type: 'pair' };
  }
  if (hand.length === 3) {
    const highRank = hand[0] as Rank;
    const lowRank = hand[1] as Rank;
    const suffix = hand[2];
    if (suffix === 's') return { highRank, lowRank, type: 'suited' };
    if (suffix === 'o') return { highRank, lowRank, type: 'offsuit' };
  }
  return null;
}

/**
 * Expand a canonical hand string into all concrete two-card combos.
 * Returns up to 6 (pair), 4 (suited), or 12 (offsuit) combinations.
 */
function expandCombos(canonical: string): [Card, Card][] {
  const parsed = parseCanonical(canonical);
  if (!parsed) return [];

  const { highRank, lowRank, type } = parsed;
  const combos: [Card, Card][] = [];

  if (type === 'pair') {
    // C(4, 2) = 6 combos
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        combos.push([
          { rank: highRank, suit: SUITS[i] },
          { rank: lowRank, suit: SUITS[j] }
        ]);
      }
    }
  } else if (type === 'suited') {
    // 4 combos — one per suit
    for (const suit of SUITS) {
      combos.push([
        { rank: highRank, suit },
        { rank: lowRank, suit }
      ]);
    }
  } else {
    // Offsuit: 4 * 4 = 16 total, minus 4 same-suit = 12
    for (const suit1 of SUITS) {
      for (const suit2 of SUITS) {
        if (suit1 !== suit2) {
          combos.push([
            { rank: highRank, suit: suit1 },
            { rank: lowRank, suit: suit2 }
          ]);
        }
      }
    }
  }

  return combos;
}

// ── Weighted combo builder ──

/**
 * Build a flat weighted list of all concrete card combos in a range,
 * filtered to hands where the continuing action has non-zero frequency.
 *
 * excludeCards: set of card keys (e.g. "Ah", "Kd") already dealt to another player.
 */
function buildWeightedCombos(
  charts: PreflopCharts,
  ref: RangeRef,
  excludeCards: Set<string> = new Set()
): WeightedCombo[] {
  const scenario = charts.getScenario(ref.scenario, ref.position, ref.vsPosition);
  if (!scenario) return [];

  const result: WeightedCombo[] = [];

  for (const [hand, freq] of Object.entries(scenario.ranges)) {
    const weight = (freq[ref.continuingAction as keyof typeof freq] ?? 0) as number;
    if (weight < 0.001) continue;

    const combos = expandCombos(hand);
    for (const combo of combos) {
      // Skip combos that contain excluded cards
      if (excludeCards.has(cardKey(combo[0])) || excludeCards.has(cardKey(combo[1]))) {
        continue;
      }
      result.push({ cards: combo, weight });
    }
  }

  return result;
}

// ── Weighted reservoir sampling ──

/** Crypto-quality random float in [0, 1). */
function randomFloat(): number {
  const buf = new Uint32Array(1);
  webcrypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

/**
 * Sample one concrete [Card, Card] pair from the weighted combo list.
 * Returns null if the list is empty (no valid combos).
 */
function sampleFromWeighted(combos: WeightedCombo[]): [Card, Card] | null {
  if (combos.length === 0) return null;
  if (combos.length === 1) return combos[0].cards;

  const total = combos.reduce((sum, c) => sum + c.weight, 0);
  const target = randomFloat() * total;

  let cumulative = 0;
  for (const combo of combos) {
    cumulative += combo.weight;
    if (target < cumulative) return combo.cards;
  }

  return combos[combos.length - 1].cards;
}

// ── Public API ──

/**
 * Sample one concrete [Card, Card] hand for a player from a preflop range.
 *
 * @param charts - Loaded preflop charts
 * @param ref - Which range file and continuing action to use
 * @param excludeCards - Card keys already dealt to another player (to avoid conflicts)
 * @returns Sampled hole cards, or null if no valid combo exists
 */
export function sampleHand(
  charts: PreflopCharts,
  ref: RangeRef,
  excludeCards: Set<string> = new Set()
): [Card, Card] | null {
  const combos = buildWeightedCombos(charts, ref, excludeCards);
  return sampleFromWeighted(combos);
}

/**
 * Sample hero and villain hole cards together, ensuring no card conflicts.
 * Retries up to maxRetries times if a conflict occurs.
 *
 * @returns { heroCards, villainCards } or null if sampling fails after maxRetries
 */
export function sampleSpotHands(
  charts: PreflopCharts,
  heroRef: RangeRef,
  villainRef: RangeRef,
  maxRetries = 20
): { heroCards: [Card, Card]; villainCards: [Card, Card] } | null {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const heroCards = sampleHand(charts, heroRef);
    if (!heroCards) return null;

    const heroCardKeys = new Set([cardKey(heroCards[0]), cardKey(heroCards[1])]);
    const villainCards = sampleHand(charts, villainRef, heroCardKeys);
    if (villainCards) {
      return { heroCards, villainCards };
    }
    // Conflict — try again with a new hero hand
  }

  return null;
}

/**
 * Build a set of card keys from an array of cards (for use as excludeCards).
 * Useful when board cards are known ahead of time.
 */
export function cardSet(cards: Card[]): Set<string> {
  return new Set(cards.map(cardKey));
}

// Exported for testing
export { expandCombos, buildWeightedCombos, parseCanonical };
