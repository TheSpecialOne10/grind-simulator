import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, shuffleSeeded, deal, burn } from '../../src/main/engine/deck';

describe('createDeck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);

    const keys = new Set(deck.map(c => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });

  it('contains all ranks and suits', () => {
    const deck = createDeck();
    const suits = new Set(deck.map(c => c.suit));
    const ranks = new Set(deck.map(c => c.rank));
    expect(suits.size).toBe(4);
    expect(ranks.size).toBe(13);
  });
});

describe('shuffle', () => {
  it('returns a 52-card permutation', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);

    const keys = new Set(shuffled.map(c => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = [...deck];
    shuffle(deck);
    expect(deck).toEqual(original);
  });

  it('produces different orderings across calls (probabilistic)', () => {
    const deck = createDeck();
    const a = shuffle(deck);
    const b = shuffle(deck);
    // Extremely unlikely that two shuffles are identical
    const aStr = a.map(c => `${c.rank}${c.suit}`).join(',');
    const bStr = b.map(c => `${c.rank}${c.suit}`).join(',');
    expect(aStr).not.toBe(bStr);
  });
});

describe('shuffleSeeded', () => {
  it('is deterministic given the same seed', () => {
    const deck = createDeck();
    const a = shuffleSeeded(deck, 42);
    const b = shuffleSeeded(deck, 42);
    expect(a).toEqual(b);
  });

  it('produces different results for different seeds', () => {
    const deck = createDeck();
    const a = shuffleSeeded(deck, 42);
    const b = shuffleSeeded(deck, 99);
    const aStr = a.map(c => `${c.rank}${c.suit}`).join(',');
    const bStr = b.map(c => `${c.rank}${c.suit}`).join(',');
    expect(aStr).not.toBe(bStr);
  });

  it('returns a valid 52-card permutation', () => {
    const deck = createDeck();
    const shuffled = shuffleSeeded(deck, 12345);
    expect(shuffled).toHaveLength(52);
    const keys = new Set(shuffled.map(c => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });
});

describe('deal', () => {
  it('deals the correct number of cards from the top', () => {
    const deck = createDeck();
    const { dealt, remaining } = deal(deck, 2);
    expect(dealt).toHaveLength(2);
    expect(remaining).toHaveLength(50);
    expect(dealt[0]).toEqual(deck[0]);
    expect(dealt[1]).toEqual(deck[1]);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = [...deck];
    deal(deck, 5);
    expect(deck).toEqual(original);
  });

  it('throws when dealing more cards than available', () => {
    const deck = createDeck();
    expect(() => deal(deck, 53)).toThrow('Cannot deal 53 cards from deck of 52');
  });

  it('deals all 52 cards', () => {
    const deck = createDeck();
    const { dealt, remaining } = deal(deck, 52);
    expect(dealt).toHaveLength(52);
    expect(remaining).toHaveLength(0);
  });

  it('deals 0 cards', () => {
    const deck = createDeck();
    const { dealt, remaining } = deal(deck, 0);
    expect(dealt).toHaveLength(0);
    expect(remaining).toHaveLength(52);
  });
});

describe('burn', () => {
  it('removes one card from the top', () => {
    const deck = createDeck();
    const firstCard = deck[0];
    const { burned, remaining } = burn(deck);
    expect(burned).toEqual(firstCard);
    expect(remaining).toHaveLength(51);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = [...deck];
    burn(deck);
    expect(deck).toEqual(original);
  });

  it('throws on empty deck', () => {
    expect(() => burn([])).toThrow('Cannot burn from empty deck');
  });
});
