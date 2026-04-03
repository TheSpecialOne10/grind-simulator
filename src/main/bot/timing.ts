import { webcrypto } from 'node:crypto';
import type { ActionType, Street } from '../../shared/types';
import { BOT_DELAY_MIN_MS, BOT_DELAY_MAX_MS } from '../../shared/constants';

interface TimingContext {
  street: Street;
  potSize: number;    // cents
  isAllIn: boolean;
  actionType: ActionType;
}

/**
 * Generate a realistic bot action delay using a log-normal distribution.
 * Returns milliseconds, clamped to [1000, 8000].
 */
export function getBotDelay(context: TimingContext): number {
  // Base parameters for log-normal distribution
  // Mean ~3 seconds, with adjustments per context
  let mu = Math.log(3000); // ~3 seconds center
  const sigma = 0.4;

  // Context adjustments
  if (context.street === 'preflop' && context.actionType === 'fold') {
    mu = Math.log(1500); // Quick preflop folds: 1-2s
  } else if (context.street === 'preflop') {
    mu = Math.log(2000); // Preflop actions: 1.5-3s
  } else if (context.isAllIn) {
    mu = Math.log(5500); // All-in decisions: 4-8s
  } else if (context.street === 'river') {
    mu = Math.log(3500); // River decisions are a bit longer
  }
  // Postflop default stays at ~3s

  // Box-Muller transform to generate normal random
  const normal = boxMullerRandom();

  // Log-normal value
  const delay = Math.exp(mu + sigma * normal);

  // Clamp
  return Math.round(Math.max(BOT_DELAY_MIN_MS, Math.min(BOT_DELAY_MAX_MS, delay)));
}

/** Box-Muller transform: generates a standard normal random variable using crypto RNG. */
function boxMullerRandom(): number {
  const bytes = new Uint32Array(2);
  webcrypto.getRandomValues(bytes);

  const u1 = (bytes[0] + 1) / 0x100000001; // (0, 1]
  const u2 = bytes[1] / 0x100000000;        // [0, 1)

  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}
