// ── Card types ──

export type Suit = 'c' | 'd' | 'h' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

// ── Position & seating ──

export type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'HJ' | 'CO';

export interface Player {
  seatIndex: number;        // 0–5, fixed physical seat
  name: string;
  stack: number;            // Current stack in cents (integer)
  holeCards: [Card, Card] | null;
  isHuman: boolean;
  isActive: boolean;        // Still in the hand
  isSittingOut: boolean;
  currentBet: number;       // Bet placed in current betting round (cents)
  hasActed: boolean;        // Has acted this betting round
  position: Position;       // Current position label
}

// ── Actions ──

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'post_sb' | 'post_bb';

export interface Action {
  playerSeatIndex: number;
  type: ActionType;
  amount: number;           // In cents. 0 for fold/check.
  timestamp: number;
}

// ── Hand state (main process source of truth) ──

export interface SidePot {
  amount: number;           // cents
  eligiblePlayers: number[]; // Seat indices
}

export interface HandState {
  handId: string;
  tableId: string;
  buttonSeatIndex: number;
  players: Player[];
  deck: Card[];
  communityCards: Card[];
  street: Street;
  pot: number;              // Total pot in cents
  sidePots: SidePot[];
  actions: Action[];        // Full action history for this hand
  currentPlayerIndex: number;
  minRaise: number;         // Minimum legal raise TO amount (cents)
  isComplete: boolean;
}

// ── Renderer-safe snapshots ──

export interface PlayerSnapshot {
  seatIndex: number;
  name: string;
  stack: number;            // cents
  holeCards: [Card, Card] | null;  // null for bots unless showdown
  isActive: boolean;
  currentBet: number;       // cents
  position: Position;
  isCurrentActor: boolean;
}

export interface AvailableAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount: number;           // cents — cumulative (raise TO) for engine; bet size for bets
  displayAmount?: number;   // cents — increment for display (raise BY); omit when same as amount
  minAmount?: number;       // cents — minimum legal bet/raise
  maxAmount?: number;       // cents — maximum legal bet/raise (all-in)
  solverNodeId: string;     // UPI node ID of this child
  label: string;            // Display label
}

export interface WinnerInfo {
  seatIndex: number;
  amount: number;           // cents
  handDescription: string;  // e.g., "Two Pair, Aces and Kings"
  cards: [Card, Card];
}

export interface TableSnapshot {
  handId: string;
  tableId: string;
  players: PlayerSnapshot[];
  communityCards: Card[];
  pot: number;              // cents
  sidePots: SidePot[];
  street: Street;
  currentPlayerIndex: number;
  buttonSeatIndex: number;
  isHandComplete: boolean;
  lastAction: Action | null;
  winnerInfo: WinnerInfo[] | null;
  timeRemaining: number;    // Seconds left for current actor
  availableActions: AvailableAction[] | null; // null when not human's turn
  zoomMode: boolean;
  preflopRng: number | null;  // 0–99 RNG shown to hero preflop for GTO mixing training
  heroHasActed: boolean;      // true once hero has taken a voluntary action this hand
  spotMode?: boolean;          // true when running in Spot Trainer mode
}

// ── IPC messages ──

export interface SessionConfig {
  tableCount: number;
  playerName: string;
  revealBotCards?: boolean;
  zoomMode?: boolean;
}

export interface SpotSessionConfig {
  spotId: string;           // API scenario key, e.g. "SRP_BTN_vs_BB"
  heroSide: 'IP' | 'OOP';
  tableCount: number;
  playerName: string;
}

export interface PlayerActionMessage {
  tableId: string;
  action: ActionType;
  amount: number;           // cents
  solverNodeId: string;
}

export interface SoundTrigger {
  sound: string;
  volume: number;
  tableId: string;
}

export interface Hotkeys {
  fold: string;
  checkCall: string;
  betRaise: string;
  preset1: string;
  preset2: string;
  preset3: string;
  preset4: string;
}

export const DEFAULT_HOTKEYS: Hotkeys = {
  fold: 'f',
  checkCall: 'c',
  betRaise: 'r',
  preset1: '1',
  preset2: '2',
  preset3: '3',
  preset4: '4',
};

export interface Settings {
  masterVolume: number;
  handHistoryPath: string;
  solverDataPath: string;
  solverExecutablePath: string;
  solverMode: 'child_process' | 'tcp_server';
  solverServerHost: string;
  solverServerPort: number;
  playerName: string;
  hotkeys: Hotkeys;
}

// ── Bot types ──

export interface ActionFrequency {
  fold?: number;
  call?: number;
  check?: number;
  raise?: number;
  allIn?: number;
  bet?: number;
}

export interface BotDecision {
  action: ActionType;
  amount: number;           // cents
  delay: number;            // milliseconds
}

// ── Preflop feedback ──

export interface PreflopFeedbackData {
  result: 'correct' | 'mixing' | 'ev_loss';
  canonicalHand: string;          // e.g. "AJo", "TT", "KQs"
  frequencies: ActionFrequency;   // Full chart frequencies for this hand
  rng: number;                    // 0–99, the per-hand RNG used
  heroAction: ActionType;         // What the hero actually did
  /** Detailed per-sizing actions (postflop). When present, used instead of frequencies for display. */
  detailedActions?: Array<{ label: string; type: string; frequency: number; increment?: number }>;
  /** Chip → dollar conversion for displaying bet sizes in dollars. */
  chipToDollar?: number;
  /** Total pot in solver chips (for pot % labels). */
  potChips?: number;
}

// ── Postflop feedback ──

export interface PostflopFeedbackData {
  result: 'correct' | 'mixing' | 'ev_loss';
  street: 'flop' | 'turn' | 'river';
  heroAction: ActionType;
  heroCards: string;           // Canonical hand string, e.g. "AKo"
  actions: Array<{
    label: string;             // e.g. "check", "bet_33"
    type: string;
    frequency: number;
    increment?: number;        // Per-street action size in solver chips
  }>;
  chipToDollar?: number;       // Chip → dollar conversion (solver uses 50/100, game uses 0.50/1.00)
  potChips?: number;           // Total pot in solver chips (for pot % display)
  evLoss?: number;
}

// ── Hand evaluation ──

export interface HandEvalResult {
  rank: number;             // Lower = better hand
  description: string;      // "Pair of Aces", "Straight, King high", etc.
  bestFiveCards: Card[];
}
