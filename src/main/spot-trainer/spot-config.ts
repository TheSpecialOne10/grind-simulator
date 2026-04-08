import type { Position } from '../../shared/types';
import type { PreflopCharts } from '../bot/preflop-charts';

// ── Types ──

export type PotType = 'SRP' | '3BP' | '4BP';
export type HeroSide = 'IP' | 'OOP';

/**
 * Points to a preflop range file and which action frequency key
 * means "this hand is in the continuing range to the flop".
 */
export interface RangeRef {
  scenario: string;             // 'rfi' | 'vs_rfi' | 'vs_3bet' | 'vs_4bet'
  position: string;             // e.g. 'BTN', 'BB'
  vsPosition: string | null;    // e.g. 'BTN' for BB vs BTN, null for RFI
  continuingAction: 'raise' | 'call'; // Which frequency key means hand reaches the flop
}

/**
 * A fully-described postflop spot for training.
 * id matches the API's scenario key (e.g. "3BP BB vs BTN").
 */
export interface SpotConfig {
  id: string;                   // API scenario key: "3BP BB vs BTN"
  label: string;                // Display label
  potType: PotType;
  ipPosition: Position;
  oopPosition: Position;
  potBB: number;                // Pot size in BB units at flop start
  effectiveStackBB: number;     // Remaining effective stack at flop start
  chipToDollar: number;         // Solver chip unit → dollar conversion
  heroRangeRef: RangeRef;       // IP player's range ref (swapped when hero plays OOP)
  villainRangeRef: RangeRef;    // OOP player's range ref
}

// ── API scenario shape (from GET /api/v1/scenarios) ──
// The API returns oopPosition/ipPosition as literal "OOP"/"IP" (not real positions).
// All position info is encoded in the key string: "3BP BB vs BTN".

export interface ApiScenario {
  key: string;           // e.g. "3BP BB vs BTN"
  description?: string;
  oopPosition: string;   // Always "OOP" — ignore
  ipPosition: string;    // Always "IP"  — ignore
  potChips: number;      // Currently 0 in API — we use defaults
  effStackChips: number; // Currently 0 in API — we use defaults
  chipToDollar: number;
  boardCount: number;
}

// ── Position ranking (higher = acts later postflop = more IP) ──

const POSITION_RANK: Record<string, number> = {
  SB: 0, BB: 1, UTG: 2, HJ: 3, CO: 4, BTN: 5,
};

const VALID_POSITIONS = new Set(Object.keys(POSITION_RANK));

function toPosition(s: string): Position | null {
  return VALID_POSITIONS.has(s) ? (s as Position) : null;
}

// ── Default pot/stack sizes by pot type (API returns 0 currently) ──

const DEFAULT_POT_BB: Record<PotType, number> = {
  SRP:  5.5,
  '3BP': 17.5,
  '4BP': 45.0,
};
const DEFAULT_STACK_BB: Record<PotType, number> = {
  SRP:  97.5,
  '3BP': 91.5,
  '4BP': 78.0,
};

// ── Key parsing ──

/**
 * Parse an API scenario key like "3BP BB vs BTN".
 * Key convention:
 *   3BP: {3-bettor} vs {original-raiser}
 *   4BP: {4-bettor} vs {3-bettor-who-called}
 *   SRP: {opener (RFI)} vs {caller}
 */
function parseKey(key: string): { potType: PotType; agressor: string; responder: string } | null {
  const m = key.match(/^(SRP|3BP|4BP)\s+(\w+)\s+vs\s+(\w+)$/);
  if (!m) return null;
  return { potType: m[1] as PotType, agressor: m[2], responder: m[3] };
}

function determineIpOop(pos1: string, pos2: string): { ip: string; oop: string } | null {
  const r1 = POSITION_RANK[pos1];
  const r2 = POSITION_RANK[pos2];
  if (r1 === undefined || r2 === undefined) return null;
  return r1 > r2 ? { ip: pos1, oop: pos2 } : { ip: pos2, oop: pos1 };
}

/**
 * Build range refs for each position based on pot type and their role in the hand.
 *
 * 3BP key: {3-bettor} vs {original-raiser}
 *   - 3-bettor range: vs_rfi (they 3-bet the opener's RFI)  continuingAction='raise'
 *   - Original raiser range: vs_3bet (they called the 3-bet)  continuingAction='call'
 *
 * 4BP key: {4-bettor} vs {3-bettor}
 *   - 4-bettor range: vs_3bet (they RFI'd, saw a 3-bet, 4-bet)  continuingAction='raise'
 *   - 3-bettor range: vs_4bet (they 3-bet, saw a 4-bet, called)  continuingAction='call'
 *
 * SRP key: {opener} vs {caller}
 *   - Opener range: rfi  continuingAction='raise'
 *   - Caller range: vs_rfi  continuingAction='call'
 */
function buildRangeRefs(
  potType: PotType,
  agressor: string,
  responder: string
): { agrRef: RangeRef; respRef: RangeRef } | null {
  switch (potType) {
    case 'SRP':
      return {
        agrRef:  { scenario: 'rfi',    position: agressor,  vsPosition: null,       continuingAction: 'raise' },
        respRef: { scenario: 'vs_rfi', position: responder, vsPosition: agressor,   continuingAction: 'call'  },
      };
    case '3BP':
      return {
        agrRef:  { scenario: 'vs_rfi',  position: agressor,  vsPosition: responder, continuingAction: 'raise' },
        respRef: { scenario: 'vs_3bet', position: responder, vsPosition: agressor,  continuingAction: 'call'  },
      };
    case '4BP':
      return {
        agrRef:  { scenario: 'vs_3bet', position: agressor,  vsPosition: responder, continuingAction: 'raise' },
        respRef: { scenario: 'vs_4bet', position: responder, vsPosition: agressor,  continuingAction: 'call'  },
      };
    default:
      return null;
  }
}

/**
 * Build the spot catalog from API scenarios, filtered to those where
 * both IP and OOP range files are actually present in PreflopCharts.
 */
export function buildSpotCatalog(
  apiScenarios: ApiScenario[],
  charts: PreflopCharts
): SpotConfig[] {
  const result: SpotConfig[] = [];

  for (const api of apiScenarios) {
    const parsed = parseKey(api.key);
    if (!parsed) {
      console.warn(`[SpotCatalog] Cannot parse key: "${api.key}"`);
      continue;
    }

    const { potType, agressor, responder } = parsed;

    const positions = determineIpOop(agressor, responder);
    if (!positions) {
      console.warn(`[SpotCatalog] Unknown positions in key: "${api.key}"`);
      continue;
    }
    const { ip, oop } = positions;

    const ipPos = toPosition(ip);
    const oopPos = toPosition(oop);
    if (!ipPos || !oopPos) continue;

    const refs = buildRangeRefs(potType, agressor, responder);
    if (!refs) continue;

    const { agrRef, respRef } = refs;

    // heroRangeRef = IP player's ref, villainRangeRef = OOP player's ref
    const ipRef  = ip  === agressor ? agrRef  : respRef;
    const oopRef = oop === agressor ? agrRef  : respRef;

    // Only include spot if both range files are loaded locally
    const ipScenario  = charts.getScenario(ipRef.scenario,  ipRef.position,  ipRef.vsPosition);
    const oopScenario = charts.getScenario(oopRef.scenario, oopRef.position, oopRef.vsPosition);
    if (!ipScenario || !oopScenario) {
      console.log(`[SpotCatalog] Skipping "${api.key}" — missing range files`);
      continue;
    }

    // Solver trees use 50/100 blinds, game uses $0.50/$1.00.
    // 1 solver chip = $0.01, so chipToDollar = 0.01 (divide by 100).
    const chipToDollar = 0.01;

    const potBB         = api.potChips > 0 ? api.potChips * chipToDollar : DEFAULT_POT_BB[potType];
    const effectiveStackBB = api.effStackChips > 0 ? api.effStackChips * chipToDollar : DEFAULT_STACK_BB[potType];

    result.push({
      id: api.key,
      label: api.description ?? api.key,
      potType,
      ipPosition: ipPos,
      oopPosition: oopPos,
      potBB,
      effectiveStackBB,
      chipToDollar,
      heroRangeRef: ipRef,
      villainRangeRef: oopRef,
    });
  }

  console.log(`[SpotCatalog] Built ${result.length} spots from ${apiScenarios.length} API scenarios`);
  return result;
}

/**
 * Get the hero and villain range refs for a given spot and hero side.
 * Returns { heroRef, villainRef } correctly oriented for the chosen side.
 */
export function getRangeRefs(
  spot: SpotConfig,
  heroSide: HeroSide
): { heroRef: RangeRef; villainRef: RangeRef } {
  if (heroSide === 'IP') {
    return { heroRef: spot.heroRangeRef, villainRef: spot.villainRangeRef };
  }
  return { heroRef: spot.villainRangeRef, villainRef: spot.heroRangeRef };
}
