import { webcrypto } from 'node:crypto';
import type { ActionFrequency } from '../../shared/types';

/**
 * Select an action from weighted frequencies using crypto-quality randomness.
 * Returns the chosen action key (e.g., "fold", "call", "raise", "allIn").
 */
export function selectAction(frequencies: ActionFrequency): string {
  const entries = Object.entries(frequencies).filter(([, v]) => v !== undefined && v > 0) as [string, number][];

  if (entries.length === 0) {
    return 'fold'; // Safety fallback
  }

  if (entries.length === 1) {
    return entries[0][0];
  }

  // Normalize in case frequencies don't sum to exactly 1.0
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  // Generate random float in [0, 1) using crypto
  const randomBytes = new Uint32Array(1);
  webcrypto.getRandomValues(randomBytes);
  const random = randomBytes[0] / 0x100000000; // [0, 1)

  // Walk through cumulative probabilities
  let cumulative = 0;
  for (const [action, freq] of entries) {
    cumulative += freq / total;
    if (random < cumulative) {
      return action;
    }
  }

  // Floating point edge case — return last action
  return entries[entries.length - 1][0];
}

/**
 * Seeded version for deterministic testing.
 * Uses a simple xorshift32 to generate the random value.
 */
export function selectActionSeeded(frequencies: ActionFrequency, seed: number): { action: string; nextSeed: number } {
  let state = seed | 0 || 1;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  const unsigned = state >>> 0;
  const random = unsigned / 0x100000000;

  const entries = Object.entries(frequencies).filter(([, v]) => v !== undefined && v > 0) as [string, number][];
  if (entries.length === 0) return { action: 'fold', nextSeed: unsigned };
  if (entries.length === 1) return { action: entries[0][0], nextSeed: unsigned };

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  let cumulative = 0;
  for (const [action, freq] of entries) {
    cumulative += freq / total;
    if (random < cumulative) {
      return { action, nextSeed: unsigned };
    }
  }

  return { action: entries[entries.length - 1][0], nextSeed: unsigned };
}
