import type { Rank, Suit } from './types';

// All monetary values in cents (integer arithmetic, no floating point)
export const SB_CENTS = 50;
export const BB_CENTS = 100;
export const STARTING_STACK_CENTS = 10_000; // 100bb = $100.00

export const MAX_TABLES = 9;
export const MAX_SEATS = 6;

export const ACTION_TIMEOUT_SECONDS = 30;
export const BOT_DELAY_MIN_MS = 1000;
export const BOT_DELAY_MAX_MS = 8000;
export const PAUSE_BETWEEN_HANDS_MS = 2500;

export const DEFAULT_PLAYER_NAME = 'Hero';

export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS: readonly Suit[] = ['c', 'd', 'h', 's'] as const;

// Rank numeric values for comparison (ace = 14)
export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Hand category ranks (lower = better)
export const HAND_CATEGORIES = {
  ROYAL_FLUSH: 1,
  STRAIGHT_FLUSH: 2,
  FOUR_OF_A_KIND: 3,
  FULL_HOUSE: 4,
  FLUSH: 5,
  STRAIGHT: 6,
  THREE_OF_A_KIND: 7,
  TWO_PAIR: 8,
  ONE_PAIR: 9,
  HIGH_CARD: 10
} as const;

// Default settings
export const DEFAULTS = {
  blinds: { sb: SB_CENTS, bb: BB_CENTS },
  startingStack: STARTING_STACK_CENTS,
  maxTables: MAX_TABLES,
  actionTimeout: ACTION_TIMEOUT_SECONDS,
  botDelayMin: BOT_DELAY_MIN_MS,
  botDelayMax: BOT_DELAY_MAX_MS,
  playerName: DEFAULT_PLAYER_NAME,
  handHistoryPath: '',        // Set at runtime to app data dir
  solverDataPath: '',
  solverExecutablePath: '',
  solverMode: 'child_process' as const,
  solverServerHost: 'localhost',
  solverServerPort: 5251,
  masterVolume: 0.8,
  pauseBetweenHands: PAUSE_BETWEEN_HANDS_MS
};

// 6-max seat position order by street
// Preflop: UTG, MP, CO, BTN, SB, BB
// Postflop: SB, BB, UTG, MP, CO, BTN
export const POSITION_ORDER_6MAX: readonly string[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] as const;

// Preflop raise sizing (in bb units, multiply by BB_CENTS)
export const PREFLOP_OPEN_SIZE_BB = 2.5;
export const PREFLOP_3BET_IP_MULTIPLIER = 3.0;
export const PREFLOP_3BET_OOP_MULTIPLIER = 3.5;
export const PREFLOP_4BET_MULTIPLIER = 2.3;

// ── Utility ──

/** Format cents as dollar string: 5050 → "$50.50" */
export function centsToDollars(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/** Card to display string: { rank: 'A', suit: 'h' } → "Ah" */
export function cardToString(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`;
}
