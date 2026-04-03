import { describe, it, expect } from 'vitest';
import { selectAction, selectActionSeeded } from '../../src/main/bot/action-selector';

describe('selectAction', () => {
  it('returns the only action when frequency is 1.0', () => {
    expect(selectAction({ raise: 1.0 })).toBe('raise');
    expect(selectAction({ fold: 1.0 })).toBe('fold');
  });

  it('returns fold for empty frequencies', () => {
    expect(selectAction({})).toBe('fold');
  });

  it('produces a distribution matching frequencies over many trials', () => {
    const freq = { fold: 0.3, call: 0.5, raise: 0.2 };
    const counts: Record<string, number> = { fold: 0, call: 0, raise: 0 };
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
      const action = selectAction(freq);
      counts[action]++;
    }

    // Allow ±5% tolerance
    expect(counts.fold / trials).toBeCloseTo(0.3, 1);
    expect(counts.call / trials).toBeCloseTo(0.5, 1);
    expect(counts.raise / trials).toBeCloseTo(0.2, 1);
  });

  it('never returns actions with zero or undefined frequency', () => {
    const freq = { fold: 0.0, call: 1.0, raise: undefined };
    for (let i = 0; i < 100; i++) {
      const action = selectAction(freq);
      expect(action).toBe('call');
    }
  });
});

describe('selectActionSeeded', () => {
  it('is deterministic with same seed', () => {
    const freq = { fold: 0.3, call: 0.5, raise: 0.2 };
    const a = selectActionSeeded(freq, 42);
    const b = selectActionSeeded(freq, 42);
    expect(a.action).toBe(b.action);
  });

  it('produces different results with different seeds', () => {
    const freq = { fold: 0.3, call: 0.5, raise: 0.2 };
    const results = new Set<string>();
    for (let seed = 1; seed <= 10000; seed += 7) {
      results.add(selectActionSeeded(freq, seed * 1337).action);
    }
    // With many varied seeds and 3 actions, we should see all 3
    expect(results.size).toBe(3);
  });
});
