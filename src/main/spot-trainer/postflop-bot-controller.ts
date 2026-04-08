import type { ActionType, Card, HandState, Street } from '../../shared/types';
import { BB_CENTS } from '../../shared/constants';
import { selectAction } from '../bot/action-selector';
import { getBotDelay } from '../bot/timing';
import type { ActionProvider } from '../engine/types';
import type { IPostflopApiClient, ApiActionResult } from './postflop-api-client';
import { buildBoardString } from './postflop-api-client';
import { PreflopCharts } from '../bot/preflop-charts';

// ── Types ──

interface SpotModeRef {
  spotId: string;
  heroSide: 'IP' | 'OOP';
  chipToDollar: number;
  humanSeatIndex: number;
  oopSeatIndex: number;
}

/**
 * ActionProvider for bots in Spot Trainer sessions.
 * Queries the postflop API for strategy, with check/fold fallback.
 */
export class PostflopBotController implements ActionProvider {
  private apiClient: IPostflopApiClient;
  private spotRef: SpotModeRef;
  private currentNode: string = 'r:0';

  constructor(apiClient: IPostflopApiClient, spotRef: SpotModeRef) {
    this.apiClient = apiClient;
    this.spotRef = spotRef;
  }

  /** Reset the current tree node — call at the start of each hand. */
  resetNode(): void {
    this.currentNode = 'r:0';
  }

  /** Get (and update) the current UPI node after each action. */
  getCurrentNode(): string {
    return this.currentNode;
  }

  /**
   * Advance the current node after an action has been taken.
   * Called by the engine after every action (bot or human).
   */
  advanceNode(childNodeId: string): void {
    if (childNodeId) {
      this.currentNode = childNodeId;
    }
  }

  async getAction(
    handState: HandState,
    seatIndex: number,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): Promise<{ type: string; amount: number }> {
    const player = handState.players[seatIndex];
    if (!player?.holeCards) {
      return this.fallback(validActions);
    }

    const botSide = this.getBotSide(seatIndex);
    const hand = cardPairToString(player.holeCards);
    const board = buildBoardString(handState.communityCards);

    const result = await this.apiClient.getHandStrategy(
      this.spotRef.spotId,
      board,
      this.currentNode,
      hand
    );

    if (!result || result.actions.length === 0) {
      await this.applyDelay(handState.street, handState.pot, false, 'check');
      return this.fallback(validActions);
    }

    // Verify player matches (IP/OOP)
    if (result.player !== botSide) {
      // Node might be out of sync — fall back gracefully
      await this.applyDelay(handState.street, handState.pot, false, 'check');
      return this.fallback(validActions);
    }

    // Build ActionFrequency map for weighted random selection
    const freqMap: Record<string, number> = {};
    for (const action of result.actions) {
      const key = action.label; // e.g. "fold", "check", "bet_33", "raise_to_45"
      freqMap[key] = Math.max(0, action.frequency);
    }

    const chosenLabel = selectAction(freqMap);
    const chosenAction = result.actions.find(a => a.label === chosenLabel)
      ?? result.actions[0];

    // Convert chip amount to cents
    const amountCents = Math.round(chosenAction.amount * this.spotRef.chipToDollar * 100);

    // Validate against legal actions
    const legalAction = this.mapToLegalAction(chosenAction, amountCents, validActions);

    // Advance node after choosing
    this.advanceNode(chosenAction.childNodeId);

    const isAllIn = legalAction.amount >= (player.stack + player.currentBet);
    await this.applyDelay(handState.street, handState.pot, isAllIn, legalAction.type as ActionType);

    return legalAction;
  }

  private getBotSide(seatIndex: number): 'IP' | 'OOP' {
    const isOop = seatIndex === this.spotRef.oopSeatIndex;
    return isOop ? 'OOP' : 'IP';
  }

  private mapToLegalAction(
    apiAction: ApiActionResult,
    amountCents: number,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): { type: string; amount: number } {
    const valid = validActions.find(va => va.type === apiAction.type);
    if (!valid) {
      // Action not legal — fall back to check or fold
      const check = validActions.find(va => va.type === 'check');
      const call = validActions.find(va => va.type === 'call');
      return check
        ? { type: 'check', amount: 0 }
        : call
          ? { type: 'call', amount: call.minAmount }
          : { type: 'fold', amount: 0 };
    }

    if (apiAction.type === 'fold') return { type: 'fold', amount: 0 };
    if (apiAction.type === 'check') return { type: 'check', amount: 0 };
    if (apiAction.type === 'call') return { type: 'call', amount: valid.minAmount };

    // Bet or raise — clamp to legal range
    const clamped = Math.max(valid.minAmount, Math.min(amountCents, valid.maxAmount));
    return { type: apiAction.type, amount: clamped };
  }

  private fallback(
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): { type: string; amount: number } {
    const check = validActions.find(va => va.type === 'check');
    const call = validActions.find(va => va.type === 'call');
    if (check) return { type: 'check', amount: 0 };
    if (call && call.minAmount <= BB_CENTS * 3) return { type: 'call', amount: call.minAmount };
    return { type: 'fold', amount: 0 };
  }

  private applyDelay(
    street: Street,
    pot: number,
    isAllIn: boolean,
    actionType: ActionType
  ): Promise<void> {
    const delay = getBotDelay({ street, potSize: pot, isAllIn, actionType });
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

/** Convert a hole card pair to the API hand string format: "AhKd" */
function cardPairToString(cards: [Card, Card]): string {
  return `${cards[0].rank}${cards[0].suit}${cards[1].rank}${cards[1].suit}`;
}
