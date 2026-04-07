/**
 * Import preflop ranges from GTO Wizard .txt files into Grind Simulator JSON format.
 *
 * Source: C:\PioSOLVER\Ranges\Simulator\GTO Wizard - nl500 Simple\
 * Output: data/preflop-ranges/
 *
 * Run with: npx tsx scripts/import-preflop-ranges.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_DIR = 'C:\\PioSOLVER\\Ranges\\Simulator\\GTO Wizard - nl500 Simple';
const OUTPUT_DIR = join(__dirname, '..', 'data', 'preflop-ranges');

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a single line of GTO Wizard format into a map of canonical hand → frequency.
 *
 * Format: "AA,KK,AQo:0.94,AJs,AK,..."
 *   - No suffix = both suited AND offsuit (e.g. "AK" → "AKs" and "AKo")
 *   - "s" suffix = suited only
 *   - "o" suffix = offsuit only
 *   - Pocket pairs (e.g. "AA") have no suit suffix
 *   - ":0.94" = frequency (missing = 1.0)
 */
function parseLine(line: string): Record<string, number> {
  const result: Record<string, number> = {};
  const tokens = line.trim().split(',');

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(':');
    let hand: string;
    let freq: number;

    if (colonIdx === -1) {
      hand = trimmed;
      freq = 1.0;
    } else {
      hand = trimmed.slice(0, colonIdx);
      freq = parseFloat(trimmed.slice(colonIdx + 1));
    }

    if (!hand || isNaN(freq) || freq <= 0.001) continue;
    freq = round3(freq);

    if (hand.endsWith('s') || hand.endsWith('o')) {
      // Already canonical (suited or offsuit)
      result[hand] = freq;
    } else if (hand.length === 2 && hand[0] === hand[1]) {
      // Pocket pair (e.g. "AA", "22")
      result[hand] = freq;
    } else {
      // No suffix = expand to both suited and offsuit (e.g. "AK" → "AKs" + "AKo")
      result[hand + 's'] = freq;
      result[hand + 'o'] = freq;
    }
  }

  return result;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Read a .txt file and parse its first non-empty line. */
function readRangeFile(filePath: string): Record<string, number> {
  const content = readFileSync(filePath, 'utf-8');
  const line = content.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? '';
  return parseLine(line);
}

/** Extract betSizeBB from filename (e.g. "BTN-2.5bb.txt" → 2.5, "BB_vs_BTN-13bb.txt" → 13). */
function parseBetSize(filename: string, defaultBB = 100): number {
  const match = filename.match(/-(\d+(?:\.\d+)?)bb\.txt$/i);
  return match ? parseFloat(match[1]) : defaultBB;
}

/** Extract position and vsPosition from filename. */
function parsePositions(filename: string): { position: string; vsPosition: string | null } {
  // "BB_vs_BTN-13bb.txt" or "BB_vs_BTN.txt"
  const vsMatch = filename.match(/^([A-Z]+)_vs_([A-Z]+)/i);
  if (vsMatch) {
    return { position: vsMatch[1].toUpperCase(), vsPosition: vsMatch[2].toUpperCase() };
  }
  // "UTG-2bb.txt" or "SB-3bb.txt"
  const simpleMatch = filename.match(/^([A-Z]+)[-\.]/i);
  if (simpleMatch) {
    return { position: simpleMatch[1].toUpperCase(), vsPosition: null };
  }
  return { position: 'UNKNOWN', vsPosition: null };
}

// ── JSON building ────────────────────────────────────────────────────────────

interface ActionFrequency {
  raise?: number;
  call?: number;
  fold?: number;
}

interface ScenarioFile {
  scenario: string;
  position: string;
  vsPosition: string | null;
  description: string;
  defaultAction: string;
  betSizeBB: number;
  ranges: Record<string, ActionFrequency>;
}

/**
 * Merge raise frequencies and call frequencies into a combined ranges object.
 * Adds explicit fold = 1 - raise - call so frequencies always sum to 1.0,
 * satisfying the PreflopCharts validator.
 */
function mergeRanges(
  raiseFreqs: Record<string, number>,
  callFreqs: Record<string, number>,
): Record<string, ActionFrequency> {
  const allHands = new Set([...Object.keys(raiseFreqs), ...Object.keys(callFreqs)]);
  const ranges: Record<string, ActionFrequency> = {};

  for (const hand of allHands) {
    const entry: ActionFrequency = {};
    if (raiseFreqs[hand]) entry.raise = raiseFreqs[hand];
    if (callFreqs[hand]) entry.call = callFreqs[hand];
    const rawSum = (entry.raise ?? 0) + (entry.call ?? 0);
    if (rawSum > 1.0) {
      // Normalize: scale raise and call proportionally so they sum to 1.0
      const scale = 1.0 / rawSum;
      if (entry.raise) entry.raise = round3(entry.raise * scale);
      if (entry.call) entry.call = round3(entry.call * scale);
    }
    const foldFreq = round3(1 - (entry.raise ?? 0) - (entry.call ?? 0));
    if (foldFreq > 0.001) entry.fold = foldFreq;
    if (Object.keys(entry).length > 0) {
      ranges[hand] = entry;
    }
  }

  return ranges;
}

function writeJson(outPath: string, data: ScenarioFile): void {
  writeFileSync(outPath, JSON.stringify(data, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let written = 0;
  const errors: string[] = [];

  // ── 1. RFI — open raise ranges ──────────────────────────────────────────
  const rfiDir = join(SOURCE_DIR, 'rfi');
  for (const file of readdirSync(rfiDir).filter(f => f.endsWith('.txt'))) {
    try {
      const freqs = readRangeFile(join(rfiDir, file));
      const { position } = parsePositions(file);
      const betSizeBB = parseBetSize(file);

      const ranges: Record<string, ActionFrequency> = {};
      for (const [hand, freq] of Object.entries(freqs)) {
        const foldFreq = round3(1 - freq);
        ranges[hand] = foldFreq > 0.001 ? { raise: freq, fold: foldFreq } : { raise: freq };
      }

      const data: ScenarioFile = {
        scenario: 'rfi',
        position,
        vsPosition: null,
        description: `${position} raise first in (${betSizeBB}bb)`,
        defaultAction: 'fold',
        betSizeBB,
        ranges,
      };

      const outFile = join(OUTPUT_DIR, `rfi_${position.toLowerCase()}.json`);
      writeJson(outFile, data);
      console.log(`  [rfi]     ${file} → rfi_${position.toLowerCase()}.json`);
      written++;
    } catch (err) {
      errors.push(`rfi/${file}: ${err}`);
    }
  }

  // ── 2. vs_rfi — 3bet ranges, merged with call_rfi where available ────────
  const threebetDir = join(SOURCE_DIR, '3bet');
  const callRfiDir = join(SOURCE_DIR, 'call_rfi');

  for (const file of readdirSync(threebetDir).filter(f => f.endsWith('.txt'))) {
    try {
      const raiseFreqs = readRangeFile(join(threebetDir, file));
      const { position, vsPosition } = parsePositions(file);
      const betSizeBB = parseBetSize(file);

      // Merge with call_rfi if available (only BB has call ranges vs opens)
      const callFilename = `${position}_vs_${vsPosition}.txt`;
      const callPath = join(callRfiDir, callFilename);
      const callFreqs = existsSync(callPath) ? readRangeFile(callPath) : {};

      const hasCalls = Object.keys(callFreqs).length > 0;
      const ranges = mergeRanges(raiseFreqs, callFreqs);

      const data: ScenarioFile = {
        scenario: 'vs_rfi',
        position,
        vsPosition,
        description: hasCalls
          ? `${position} vs ${vsPosition} open (3bet/call/fold)`
          : `${position} vs ${vsPosition} open (3bet-or-fold)`,
        defaultAction: 'fold',
        betSizeBB,
        ranges,
      };

      const outFile = join(OUTPUT_DIR, `vs_rfi_${position.toLowerCase()}_vs_${vsPosition!.toLowerCase()}.json`);
      writeJson(outFile, data);
      console.log(`  [vs_rfi]  ${file} → vs_rfi_${position.toLowerCase()}_vs_${vsPosition!.toLowerCase()}.json${hasCalls ? ' (+calls)' : ''}`);
      written++;
    } catch (err) {
      errors.push(`3bet/${file}: ${err}`);
    }
  }

  // ── 3. vs_3bet — 4bet ranges, merged with call_3bet ─────────────────────
  const fourbetDir = join(SOURCE_DIR, '4bet');
  const call3betDir = join(SOURCE_DIR, 'call_3bet');

  for (const file of readdirSync(fourbetDir).filter(f => f.endsWith('.txt'))) {
    try {
      const raiseFreqs = readRangeFile(join(fourbetDir, file));
      const { position, vsPosition } = parsePositions(file);
      const betSizeBB = parseBetSize(file);

      const callFilename = `${position}_vs_${vsPosition}.txt`;
      const callPath = join(call3betDir, callFilename);
      const callFreqs = existsSync(callPath) ? readRangeFile(callPath) : {};

      const ranges = mergeRanges(raiseFreqs, callFreqs);

      const data: ScenarioFile = {
        scenario: 'vs_3bet',
        position,
        vsPosition,
        description: `${position} vs ${vsPosition} 3-bet (${betSizeBB}bb)`,
        defaultAction: 'fold',
        betSizeBB,
        ranges,
      };

      const outFile = join(OUTPUT_DIR, `vs_3bet_${position.toLowerCase()}_vs_${vsPosition!.toLowerCase()}.json`);
      writeJson(outFile, data);
      console.log(`  [vs_3bet] ${file} → vs_3bet_${position.toLowerCase()}_vs_${vsPosition!.toLowerCase()}.json`);
      written++;
    } catch (err) {
      errors.push(`4bet/${file}: ${err}`);
    }
  }

  // ── 4. vs_4bet — 5bet (ship) ranges, merged with call_4bet ─────────────
  const fivebetDir = join(SOURCE_DIR, '5bet');
  const call4betDir = join(SOURCE_DIR, 'call_4bet');

  for (const file of readdirSync(fivebetDir).filter(f => f.endsWith('.txt'))) {
    try {
      const raiseFreqs = readRangeFile(join(fivebetDir, file));
      const { position, vsPosition } = parsePositions(file);

      const callFilename = `${position}_vs_${vsPosition}.txt`;
      const callPath = join(call4betDir, callFilename);
      const callFreqs = existsSync(callPath) ? readRangeFile(callPath) : {};

      const ranges = mergeRanges(raiseFreqs, callFreqs);

      const data: ScenarioFile = {
        scenario: 'vs_4bet',
        position,
        vsPosition,
        description: `${position} vs ${vsPosition} 4-bet (jam or call)`,
        defaultAction: 'fold',
        betSizeBB: 100, // 5-bet is always effectively all-in
        ranges,
      };

      const outFile = join(OUTPUT_DIR, `vs_4bet_${position.toLowerCase()}_vs_${vsPosition!.toLowerCase()}.json`);
      writeJson(outFile, data);
      console.log(`  [vs_4bet] ${file} → vs_4bet_${position.toLowerCase()}_vs_${vsPosition!.toLowerCase()}.json`);
      written++;
    } catch (err) {
      errors.push(`5bet/${file}: ${err}`);
    }
  }

  // ── 5. vs_5bet — universal call range ────────────────────────────────────
  const call5betPath = join(SOURCE_DIR, 'call_5bet', 'all.txt');
  if (existsSync(call5betPath)) {
    try {
      const callFreqs = readRangeFile(call5betPath);
      const ranges: Record<string, ActionFrequency> = {};
      for (const [hand, freq] of Object.entries(callFreqs)) {
        const foldFreq = round3(1 - freq);
        ranges[hand] = foldFreq > 0.001 ? { call: freq, fold: foldFreq } : { call: freq };
      }

      const data: ScenarioFile = {
        scenario: 'vs_5bet',
        position: 'all',
        vsPosition: null,
        description: 'Universal 5-bet call range (all-in or fold)',
        defaultAction: 'fold',
        betSizeBB: 100,
        ranges,
      };

      const outFile = join(OUTPUT_DIR, 'vs_5bet_all.json');
      writeJson(outFile, data);
      console.log(`  [vs_5bet] all.txt → vs_5bet_all.json`);
      written++;
    } catch (err) {
      errors.push(`call_5bet/all.txt: ${err}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\nWrote ${written} JSON files to ${OUTPUT_DIR}`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

main();
