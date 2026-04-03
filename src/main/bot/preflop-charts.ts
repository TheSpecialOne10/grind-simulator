import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Card, ActionFrequency, Position } from '../../shared/types';
import { RANK_VALUES } from '../../shared/constants';

/**
 * Schema for a single preflop scenario file.
 * Each file covers one scenario (e.g., "RFI from UTG", "BB vs UTG open").
 *
 * Expected JSON format:
 * {
 *   "scenario": "rfi",
 *   "position": "UTG",
 *   "vsPosition": null,
 *   "description": "UTG open raise first in",
 *   "defaultAction": "fold",
 *   "ranges": {
 *     "AA":  { "raise": 1.0 },
 *     "AKs": { "raise": 1.0 },
 *     "AKo": { "raise": 0.85, "fold": 0.15 },
 *     "72o": { "fold": 1.0 },
 *     ...
 *   }
 * }
 */
export interface PreflopScenarioFile {
  scenario: string;         // "rfi", "vs_rfi", "vs_3bet", "vs_4bet"
  position: string;         // Position of the player acting (e.g., "UTG", "BB")
  vsPosition: string | null; // Position of the opponent (e.g., "UTG" for "BB vs UTG open")
  description: string;
  defaultAction: string;    // Action when hand not found in ranges (usually "fold")
  ranges: Record<string, ActionFrequency>;  // Hand → action frequencies
}

/**
 * Lookup key for a specific preflop scenario.
 * Format: "{scenario}:{position}" or "{scenario}:{position}_vs_{vsPosition}"
 */
function scenarioKey(scenario: string, position: string, vsPosition: string | null): string {
  if (vsPosition) {
    return `${scenario}:${position}_vs_${vsPosition}`;
  }
  return `${scenario}:${position}`;
}

/**
 * Loads and manages preflop range data from external JSON files.
 * Ranges are admin-provided, not hardcoded.
 */
export class PreflopCharts {
  private scenarios: Map<string, PreflopScenarioFile> = new Map();
  private loaded: boolean = false;

  /**
   * Load all preflop range files from a directory.
   * Expects JSON files matching the PreflopScenarioFile schema.
   */
  loadFromDirectory(dirPath: string): { loaded: number; errors: string[] } {
    const errors: string[] = [];
    let loaded = 0;

    if (!existsSync(dirPath)) {
      errors.push(`Directory does not exist: ${dirPath}`);
      return { loaded, errors };
    }

    const files = readdirSync(dirPath).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = join(dirPath, file);
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as PreflopScenarioFile;

        const validation = this.validate(data, file);
        if (validation.length > 0) {
          errors.push(...validation);
          continue;
        }

        const key = scenarioKey(data.scenario, data.position, data.vsPosition);
        this.scenarios.set(key, data);
        loaded++;
      } catch (err) {
        errors.push(`Failed to load ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.loaded = loaded > 0;
    return { loaded, errors };
  }

  /**
   * Load a single scenario from a parsed object (useful for testing).
   */
  loadScenario(data: PreflopScenarioFile): void {
    const key = scenarioKey(data.scenario, data.position, data.vsPosition);
    this.scenarios.set(key, data);
    this.loaded = true;
  }

  /**
   * Get action frequencies for a specific hand in a specific scenario.
   * Returns null if the scenario is not loaded.
   */
  getFrequencies(
    scenario: string,
    position: string,
    vsPosition: string | null,
    hand: string
  ): ActionFrequency | null {
    const key = scenarioKey(scenario, position, vsPosition);
    const data = this.scenarios.get(key);
    if (!data) return null;

    const freq = data.ranges[hand];
    if (freq) return freq;

    // Hand not in ranges — use default action
    return { [data.defaultAction]: 1.0 };
  }

  /**
   * Determine the preflop scenario based on the action history.
   * Returns { scenario, position, vsPosition } or null if cannot determine.
   */
  static classifyScenario(
    actions: { type: string; playerPosition: string }[],
    actingPosition: string
  ): { scenario: string; position: string; vsPosition: string | null } | null {
    // Filter to meaningful actions (ignore blinds)
    const meaningful = actions.filter(a => a.type !== 'post_sb' && a.type !== 'post_bb');

    // No raises yet — this is RFI (raise first in) or fold situation
    const raises = meaningful.filter(a => a.type === 'raise');
    const calls = meaningful.filter(a => a.type === 'call');

    if (raises.length === 0 && calls.length === 0) {
      // No one has acted meaningfully, or everyone folded
      // This player is first to act — RFI scenario
      return { scenario: 'rfi', position: actingPosition, vsPosition: null };
    }

    if (raises.length === 1 && calls.length === 0) {
      // One raise, no calls — facing an open raise
      const raiserPos = raises[0].playerPosition;
      if (raiserPos === actingPosition) {
        // We are the raiser — shouldn't happen, but return rfi
        return { scenario: 'rfi', position: actingPosition, vsPosition: null };
      }
      return { scenario: 'vs_rfi', position: actingPosition, vsPosition: raiserPos };
    }

    if (raises.length === 2) {
      // Two raises — someone opened, someone 3-bet
      const opener = raises[0].playerPosition;
      const threeBettor = raises[1].playerPosition;

      if (actingPosition === opener) {
        // We opened and are facing a 3-bet
        return { scenario: 'vs_3bet', position: actingPosition, vsPosition: threeBettor };
      }
      if (actingPosition === threeBettor) {
        // We 3-bet — shouldn't be asked again unless facing a 4-bet
        return null;
      }
      // Third party facing a 3-bet — treat as vs_3bet from their perspective
      return { scenario: 'vs_3bet', position: actingPosition, vsPosition: threeBettor };
    }

    if (raises.length === 3) {
      // Three raises — 4-bet scenario
      const threeBettor = raises[1].playerPosition;
      const fourBettor = raises[2].playerPosition;

      if (actingPosition === threeBettor) {
        return { scenario: 'vs_4bet', position: actingPosition, vsPosition: fourBettor };
      }
    }

    // Limp pots or complex multiway — return null (use fallback)
    if (raises.length === 0 && calls.length > 0) {
      // Limp pot
      return { scenario: 'limp', position: actingPosition, vsPosition: null };
    }

    return null;
  }

  /**
   * Convert two hole cards to canonical hand string.
   * Examples: Ah Kd → "AKo", Qs Js → "QJs", Ac Ad → "AA"
   */
  static getCanonicalHand(card1: Card, card2: Card): string {
    const v1 = RANK_VALUES[card1.rank];
    const v2 = RANK_VALUES[card2.rank];

    // Order by rank (higher first)
    const [high, low] = v1 >= v2 ? [card1, card2] : [card2, card1];

    if (high.rank === low.rank) {
      // Pocket pair
      return `${high.rank}${low.rank}`;
    }

    const suited = high.suit === low.suit;
    return `${high.rank}${low.rank}${suited ? 's' : 'o'}`;
  }

  /** Validate a scenario file's structure. Returns list of error messages. */
  private validate(data: PreflopScenarioFile, filename: string): string[] {
    const errors: string[] = [];

    if (!data.scenario) errors.push(`${filename}: missing 'scenario' field`);
    if (!data.position) errors.push(`${filename}: missing 'position' field`);
    if (!data.ranges || typeof data.ranges !== 'object') {
      errors.push(`${filename}: missing or invalid 'ranges' field`);
      return errors;
    }
    if (!data.defaultAction) errors.push(`${filename}: missing 'defaultAction' field`);

    // Validate frequency sums
    for (const [hand, freq] of Object.entries(data.ranges)) {
      const sum = Object.values(freq).reduce((s, v) => s + (v ?? 0), 0);
      if (Math.abs(sum - 1.0) > 0.01) {
        errors.push(`${filename}: hand '${hand}' frequencies sum to ${sum.toFixed(3)}, expected ~1.0`);
      }
    }

    return errors;
  }

  /** Whether any ranges are loaded. */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Get all loaded scenario keys (for debugging). */
  getLoadedScenarios(): string[] {
    return [...this.scenarios.keys()];
  }
}
