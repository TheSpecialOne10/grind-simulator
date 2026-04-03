import type { ActionType, BotDecision, HandState, Player } from '../../shared/types';
import { BB_CENTS, SB_CENTS } from '../../shared/constants';
import { PreflopCharts } from './preflop-charts';
import { selectAction } from './action-selector';
import { getBotDelay } from './timing';
import type { ActionProvider } from '../engine/types';

// Preflop raise sizing in cents
const OPEN_RAISE_CENTS = Math.round(2.5 * BB_CENTS); // 250
const THREE_BET_IP_MULTIPLIER = 3.0;
const THREE_BET_OOP_MULTIPLIER = 3.5;
const FOUR_BET_MULTIPLIER = 2.3;

/**
 * Bot AI controller that implements the ActionProvider interface.
 * Uses preflop charts when available, falls back to simple heuristic.
 */
export class BotController implements ActionProvider {
  private charts: PreflopCharts;
  private useDelay: boolean;

  constructor(charts: PreflopCharts, useDelay: boolean = true) {
    this.charts = charts;
    this.useDelay = useDelay;
  }

  async getAction(
    handState: HandState,
    seatIndex: number,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): Promise<{ type: string; amount: number }> {
    const decision = this.decide(handState, seatIndex, validActions);

    // Apply delay if enabled
    if (this.useDelay && decision.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, decision.delay));
    }

    return { type: decision.action, amount: decision.amount };
  }

  /**
   * Core decision logic. Synchronous — delay is applied in getAction().
   */
  decide(
    handState: HandState,
    seatIndex: number,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): BotDecision {
    const player = handState.players[seatIndex];
    if (!player?.holeCards) {
      return this.fallbackFold(handState.street, validActions);
    }

    if (handState.street === 'preflop') {
      return this.decidePreflopAction(handState, player, validActions);
    }

    // Postflop: check/fold placeholder until solver integration (Phase 5)
    return this.decidePostflopFallback(handState, player, validActions);
  }

  private decidePreflopAction(
    handState: HandState,
    player: Player,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): BotDecision {
    const hand = PreflopCharts.getCanonicalHand(player.holeCards![0], player.holeCards![1]);

    // Classify the preflop scenario
    const actionHistory = handState.actions.map(a => ({
      type: a.type,
      playerPosition: handState.players[a.playerSeatIndex]?.position ?? 'UTG'
    }));
    const scenario = PreflopCharts.classifyScenario(actionHistory, player.position);

    let frequencies = null;
    if (scenario) {
      frequencies = this.charts.getFrequencies(
        scenario.scenario,
        scenario.position,
        scenario.vsPosition,
        hand
      );
    }

    if (!frequencies) {
      // No chart data — use simple fallback
      return this.preflopFallbackNoChart(player, validActions, handState);
    }

    // Select action from frequencies
    const selectedAction = selectAction(frequencies);

    return this.mapPreflopAction(
      selectedAction,
      player,
      validActions,
      handState
    );
  }

  /**
   * Map a selected action string ("raise", "call", "fold", "allIn")
   * to a concrete BotDecision with proper sizing.
   */
  private mapPreflopAction(
    selected: string,
    player: Player,
    validActions: { type: string; minAmount: number; maxAmount: number }[],
    handState: HandState
  ): BotDecision {
    const street = handState.street;

    if (selected === 'fold') {
      const fold = validActions.find(a => a.type === 'fold');
      if (fold) return this.makeBotDecision('fold', 0, street, 'fold');
      // Can't fold — check instead
      const check = validActions.find(a => a.type === 'check');
      if (check) return this.makeBotDecision('check', 0, street, 'check');
      return this.fallbackFold(street, validActions);
    }

    if (selected === 'call') {
      const call = validActions.find(a => a.type === 'call');
      if (call) return this.makeBotDecision('call', call.minAmount, street, 'call');
      // Can't call — check
      const check = validActions.find(a => a.type === 'check');
      if (check) return this.makeBotDecision('check', 0, street, 'check');
      return this.fallbackFold(street, validActions);
    }

    if (selected === 'allIn') {
      const raise = validActions.find(a => a.type === 'raise');
      if (raise) return this.makeBotDecision('raise', raise.maxAmount, street, 'raise', true);
      const bet = validActions.find(a => a.type === 'bet');
      if (bet) return this.makeBotDecision('bet', bet.maxAmount, street, 'bet', true);
      return this.fallbackFold(street, validActions);
    }

    if (selected === 'raise') {
      // Determine raise sizing
      const raiseSize = this.calculatePreflopRaiseSize(handState, validActions);

      const raise = validActions.find(a => a.type === 'raise');
      if (raise) {
        const amount = Math.max(raise.minAmount, Math.min(raiseSize, raise.maxAmount));
        return this.makeBotDecision('raise', amount, street, 'raise');
      }
      const bet = validActions.find(a => a.type === 'bet');
      if (bet) {
        const amount = Math.max(bet.minAmount, Math.min(raiseSize, bet.maxAmount));
        return this.makeBotDecision('bet', amount, street, 'bet');
      }
      // Can't raise — call instead
      const call = validActions.find(a => a.type === 'call');
      if (call) return this.makeBotDecision('call', call.minAmount, street, 'call');
      return this.fallbackFold(street, validActions);
    }

    // Unknown action — fold
    return this.fallbackFold(street, validActions);
  }

  /**
   * Calculate the appropriate preflop raise size based on action history.
   */
  private calculatePreflopRaiseSize(
    handState: HandState,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): number {
    const raises = handState.actions.filter(a => a.type === 'raise');

    if (raises.length === 0) {
      // RFI: open to 2.5bb
      return OPEN_RAISE_CENTS;
    }

    // Find the last raise amount (total invested by that player)
    const lastRaise = this.getLastRaiseTotal(handState);

    if (raises.length === 1) {
      // 3-bet: multiply the open raise
      // Use IP/OOP multiplier (simplified: always use 3x for now)
      return Math.round(lastRaise * THREE_BET_IP_MULTIPLIER);
    }

    if (raises.length === 2) {
      // 4-bet
      return Math.round(lastRaise * FOUR_BET_MULTIPLIER);
    }

    // 5-bet+: all-in
    const raise = validActions.find(a => a.type === 'raise');
    return raise?.maxAmount ?? OPEN_RAISE_CENTS;
  }

  /** Get the total amount the last raiser invested. */
  private getLastRaiseTotal(handState: HandState): number {
    const raises = handState.actions.filter(a => a.type === 'raise');
    if (raises.length === 0) return BB_CENTS;

    // Sum all bets by the last raiser
    const lastRaiser = raises[raises.length - 1].playerSeatIndex;
    let total = 0;
    for (const action of handState.actions) {
      if (action.playerSeatIndex === lastRaiser && action.amount > 0) {
        total += action.amount;
      }
    }
    return total || BB_CENTS;
  }

  /**
   * Simple postflop fallback: check when possible, fold otherwise.
   * Will be replaced by solver integration in Phase 5 and heuristic fallback.
   */
  private decidePostflopFallback(
    handState: HandState,
    player: Player,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): BotDecision {
    const check = validActions.find(a => a.type === 'check');
    if (check) {
      return this.makeBotDecision('check', 0, handState.street, 'check');
    }
    const call = validActions.find(a => a.type === 'call');
    if (call) {
      // Call small bets, fold large ones (simplified)
      const potSize = handState.pot;
      if (potSize > 0 && call.minAmount <= potSize * 0.5) {
        return this.makeBotDecision('call', call.minAmount, handState.street, 'call');
      }
    }
    return this.fallbackFold(handState.street, validActions);
  }

  /**
   * Fallback when no preflop chart data is available.
   * Very simple: premium hands raise, medium call, trash fold.
   */
  private preflopFallbackNoChart(
    player: Player,
    validActions: { type: string; minAmount: number; maxAmount: number }[],
    handState: HandState
  ): BotDecision {
    const hand = PreflopCharts.getCanonicalHand(player.holeCards![0], player.holeCards![1]);
    const isPair = hand.length === 2;
    const rank1 = hand[0];
    const rank2 = hand[1];

    // Very rough hand strength tiers
    const premiumPairs = ['AA', 'KK', 'QQ', 'JJ'];
    const goodHands = ['AKs', 'AKo', 'AQs', 'TT', '99'];
    const mediumHands = ['AQo', 'AJs', 'ATs', 'KQs', '88', '77', '66'];

    if (premiumPairs.includes(hand) || goodHands.includes(hand)) {
      const raise = validActions.find(a => a.type === 'raise');
      if (raise) {
        const size = this.calculatePreflopRaiseSize(handState, validActions);
        return this.makeBotDecision('raise', Math.max(raise.minAmount, Math.min(size, raise.maxAmount)),
          handState.street, 'raise');
      }
      const call = validActions.find(a => a.type === 'call');
      if (call) return this.makeBotDecision('call', call.minAmount, handState.street, 'call');
    }

    if (mediumHands.includes(hand)) {
      const call = validActions.find(a => a.type === 'call');
      if (call) return this.makeBotDecision('call', call.minAmount, handState.street, 'call');
      const check = validActions.find(a => a.type === 'check');
      if (check) return this.makeBotDecision('check', 0, handState.street, 'check');
    }

    return this.fallbackFold(handState.street, validActions);
  }

  private fallbackFold(
    street: string,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): BotDecision {
    const check = validActions.find(a => a.type === 'check');
    if (check) return this.makeBotDecision('check', 0, street as any, 'check');
    return this.makeBotDecision('fold', 0, street as any, 'fold');
  }

  private makeBotDecision(
    action: string,
    amount: number,
    street: string,
    actionTypeForTiming: string,
    isAllIn: boolean = false
  ): BotDecision {
    const delay = this.useDelay
      ? getBotDelay({
          street: street as any,
          potSize: 0,
          isAllIn,
          actionType: actionTypeForTiming as ActionType
        })
      : 0;

    return { action: action as ActionType, amount, delay };
  }
}
