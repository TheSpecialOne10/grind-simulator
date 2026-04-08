import type { Action, Card, HandState, PostflopFeedbackData, PreflopFeedbackData, TableSnapshot } from '../../shared/types';
import type { PreflopCharts } from '../bot/preflop-charts';
import type { IPostflopApiClient } from '../spot-trainer/postflop-api-client';

/**
 * Interface for providing actions (bots or human via IPC).
 * The game engine calls this to get each player's action.
 */
export interface ActionProvider {
  getAction(
    handState: HandState,
    seatIndex: number,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): Promise<{ type: string; amount: number; solverNodeId?: string }>;
}

/** Callback for emitting state snapshots to the renderer. */
export type SnapshotEmitter = (tableId: string, snapshot: TableSnapshot) => void;

/** Callback for emitting sound events. */
export type SoundEmitter = (tableId: string, sound: string) => void;

/**
 * Configuration for Spot Trainer mode.
 * When set, the engine skips preflop and starts each hand from the flop.
 */
export interface SpotModeConfig {
  /** API scenario key matching the Hetzner server (e.g. "SRP_BTN_vs_BB"). */
  spotId: string;
  /** Whether the hero plays IP or OOP in this spot. */
  heroSide: 'IP' | 'OOP';
  /** Provides pre-sampled hole cards for hero and villain each hand. */
  getHoleCards: () => { heroCards: [Card, Card]; villainCards: [Card, Card] } | null;
  /** Pot size in cents at flop start (preflop already collected). */
  potCents: number;
  /** Effective stack for both players at flop start (in cents). */
  effectiveStackCents: number;
  /** Seat index of the single villain (the non-human player). */
  villainSeatIndex: number;
  /** Seat index of the OOP player (acts first postflop). */
  oopSeatIndex: number;
  /** Chip unit → dollar conversion factor (from API scenario config). */
  chipToDollar: number;
  /** Postflop strategy API client. */
  apiClient: IPostflopApiClient;
  /** All board strings available in the API tree for this scenario (fetched at session start). */
  boards: string[];
  /** Pre-computed dealer button seat index for correct position labels (computed in table-manager). */
  buttonSeatIndex: number;
  /** Callback to emit postflop feedback to the renderer. */
  onPostflopFeedback?: (tableId: string, data: PostflopFeedbackData) => void;
}

/** Configuration for a game engine instance. */
export interface GameEngineConfig {
  tableId: string;
  humanSeatIndex: number;
  playerNames: string[];         // 6 names, index = seat index
  actionProvider: ActionProvider;
  onSnapshot: SnapshotEmitter;
  onSound?: SoundEmitter;
  onHandComplete?: (tableId: string, handState: HandState) => void;
  seed?: number;                 // Optional seed for deterministic testing
  charts?: PreflopCharts;       // Optional — enables scenario-locked bet sizing preflop
  revealBotCards?: boolean;     // Debug: show bot hole cards face-up
  zoomMode?: boolean;           // Zoom mode: hero is redirected on fold
  onPreflopFeedback?: (tableId: string, feedback: PreflopFeedbackData) => void;
  spotMode?: SpotModeConfig;    // When set, runs in Spot Trainer mode (skips preflop)
}
