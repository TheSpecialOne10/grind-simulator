import { webcrypto } from 'node:crypto';
import type { Card, Rank, Suit } from '../../shared/types';
import { RANKS, SUITS } from '../../shared/constants';

/** Create a standard 52-card deck (unshuffled). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle using crypto-quality randomness. Returns a new array. */
export function shuffle(deck: readonly Card[]): Card[] {
  const result = [...deck];
  const n = result.length;
  // Generate all random bytes we need at once (4 bytes per swap)
  const randomBytes = new Uint32Array(n - 1);
  webcrypto.getRandomValues(randomBytes);

  for (let i = n - 1; i > 0; i--) {
    const j = randomBytes[n - 1 - i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Seeded shuffle using xorshift32 PRNG for deterministic testing.
 * Returns a new array.
 */
export function shuffleSeeded(deck: readonly Card[], seed: number): Card[] {
  const result = [...deck];
  let state = seed | 0 || 1; // Ensure non-zero

  function xorshift32(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0); // unsigned
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = xorshift32() % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Deal n cards from the top of the deck. Returns dealt cards and remaining deck. */
export function deal(deck: readonly Card[], n: number): { dealt: Card[]; remaining: Card[] } {
  if (n > deck.length) {
    throw new Error(`Cannot deal ${n} cards from deck of ${deck.length}`);
  }
  return {
    dealt: deck.slice(0, n),
    remaining: deck.slice(n)
  };
}

/** Burn one card from the top. Returns the burned card and remaining deck. */
export function burn(deck: readonly Card[]): { burned: Card; remaining: Card[] } {
  if (deck.length === 0) {
    throw new Error('Cannot burn from empty deck');
  }
  return {
    burned: deck[0],
    remaining: deck.slice(1)
  };
}
