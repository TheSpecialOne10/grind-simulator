import type { Action, HandState, PreflopFeedbackData, TableSnapshot } from '../../shared/types';
import type { PreflopCharts } from '../bot/preflop-charts';

/**
 * Interface for providing actions (bots or human via IPC).
 * The game engine calls this to get each player's action.
 */
export interface ActionProvider {
  getAction(
    handState: HandState,
    seatIndex: number,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): Promise<{ type: string; amount: number }>;
}

/** Callback for emitting state snapshots to the renderer. */
export type SnapshotEmitter = (tableId: string, snapshot: TableSnapshot) => void;

/** Callback for emitting sound events. */
export type SoundEmitter = (tableId: string, sound: string) => void;

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
}
