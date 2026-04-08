import { appendFileSync } from 'fs';
import { join } from 'path';
import type { ActionType } from '../../shared/types';
import type { ApiActionResult } from './postflop-api-client';

const FEEDBACK_LOG = join(process.cwd(), 'data', 'feedback-debug.log');

// ── Types ──

export type FeedbackResult = 'correct' | 'mixing' | 'ev_loss';

export interface PostflopFeedbackData {
  result: FeedbackResult;
  street: 'flop' | 'turn' | 'river';
  heroAction: ActionType;
  heroCards: string;           // Canonical hand string, e.g. "AKo"
  actions: Array<{
    label: string;             // e.g. "check", "bet_33", "fold"
    type: string;
    frequency: number;
    increment?: number;        // Per-street action size in solver chips
  }>;
  chipToDollar?: number;       // Chip → dollar conversion
  potChips?: number;           // Total pot in solver chips (for pot % display)
  evLoss?: number;
}

/**
 * Compute postflop feedback for the hero's action using the same
 * correct/mixing/ev_loss logic as preflop feedback.
 *
 * @param heroAction - The action type the hero chose (e.g. 'bet', 'check')
 * @param heroNodeId - The childNodeId of the action the hero chose (from solverNodeId);
 *   pass empty string if unknown (falls back to matching by action type)
 * @param apiActions - The actions returned by the API at this node (with per-hand frequencies)
 * @param rng - Per-hand RNG (0–99) for mixing decisions
 * @param street - Current street
 * @param heroCards - Canonical hand string
 */
export function computePostflopFeedback(
  heroAction: ActionType,
  heroNodeId: string,
  apiActions: ApiActionResult[],
  rng: number,
  street: 'flop' | 'turn' | 'river',
  heroCards: string,
  chipToDollar: number = 0.01,
  potChips: number = 0
): PostflopFeedbackData {
  // Find the action the hero actually took in the API response
  // Match by childNodeId first (exact), then by type as fallback
  const matchedAction = apiActions.find(a => a.childNodeId === heroNodeId)
    ?? apiActions.find(a => a.type === heroAction);

  const heroFrequency = matchedAction?.frequency ?? 0;

  // Determine result
  let result: FeedbackResult;
  if (heroFrequency < 0.001) {
    result = 'ev_loss';
  } else {
    // RNG buckets ordered most aggressive → most passive:
    // largest bet/raise first → smallest → call → check → fold
    const PASSIVITY: Record<string, number> = { raise: 0, bet: 0, call: 1, check: 2, fold: 3 };
    const sorted = [...apiActions]
      .filter(a => a.frequency > 0.001)
      .sort((a, b) => {
        const pa = PASSIVITY[a.type] ?? 0;
        const pb = PASSIVITY[b.type] ?? 0;
        if (pa !== pb) return pa - pb;           // aggressive types first
        return (b.amount ?? 0) - (a.amount ?? 0); // larger sizes first within same type
      });

    let cursor = 0;
    let foundResult: FeedbackResult = 'mixing';

    for (const action of sorted) {
      const threshold = Math.round(cursor + action.frequency * 100);
      const isHeroAction = action.childNodeId === heroNodeId
        || (heroNodeId === '' && action.type === heroAction);

      if (isHeroAction) {
        foundResult = (rng >= cursor && rng < threshold) ? 'correct' : 'mixing';
        break;
      }
      cursor = threshold;
    }

    result = foundResult;
  }

  // Log full feedback details for debugging
  try {
    const sorted = [...apiActions].filter(a => a.frequency > 0.001).sort((a, b) => b.frequency - a.frequency);
    let c = 0;
    const buckets = sorted.map(a => {
      const lo = c;
      const hi = Math.round(c + a.frequency * 100);
      c = hi;
      return `  ${a.label.padEnd(12)} freq=${(a.frequency * 100).toFixed(1).padStart(5)}%  bucket=[${lo},${hi})  ${a.childNodeId === heroNodeId ? '← HERO' : ''}`;
    });
    const ts = new Date().toISOString().slice(11, 19);
    const line = [
      `\n[${ts}] ${street.toUpperCase()} | ${heroCards} | rng=${rng}`,
      `  hero action: ${heroAction} nodeId=${heroNodeId}`,
      `  matched: ${matchedAction?.label ?? 'NONE'} freq=${((matchedAction?.frequency ?? 0) * 100).toFixed(1)}%`,
      `  RESULT: ${result}`,
      `  --- buckets (sorted by freq desc) ---`,
      ...buckets,
      `  --- all actions ---`,
      ...apiActions.map(a => `  ${a.label.padEnd(12)} type=${a.type.padEnd(6)} freq=${(a.frequency * 100).toFixed(1).padStart(5)}%  nodeId=${a.childNodeId}`),
    ].join('\n');
    appendFileSync(FEEDBACK_LOG, line + '\n');
  } catch { /* ignore logging errors */ }

  return {
    result,
    street,
    heroAction,
    heroCards,
    actions: apiActions.map(a => ({
      label: a.label,
      type: a.type,
      frequency: a.frequency,
      increment: a.increment,
    })),
    chipToDollar,
    potChips,
  };
}
