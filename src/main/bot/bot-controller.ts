import type { ActionType, BotDecision, HandState, Player } from '../../shared/types';
import { BB_CENTS } from '../../shared/constants';
import { PreflopCharts } from './preflop-charts';
import { selectAction } from './action-selector';
import { getBotDelay } from './timing';
import type { ActionProvider } from '../engine/types';

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

    // vs_5bet: call or fold only (universal range keyed by 'all')
    if (scenario?.scenario === 'vs_5bet') {
      const callAction = validActions.find(a => a.type === 'call');
      const freq = this.charts.getFrequencies('vs_5bet', 'all', null, hand);
      const selected = freq ? selectAction(freq) : 'fold';
      if (selected === 'call' && callAction) {
        return this.makeBotDecision('call', callAction.minAmount, handState.street, 'call');
      }
      return this.fallbackFold(handState.street, validActions);
    }

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
      handState,
      scenario
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
    handState: HandState,
    scenario?: { scenario: string; position: string; vsPosition: string | null } | null
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
      const raiseSize = this.getPreflopRaiseCents(scenario ?? null, validActions);

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
   * Get the preflop raise-to amount in cents using the scenario's betSizeBB.
   * Falls back to all-in if the scenario has no chart data.
   */
  private getPreflopRaiseCents(
    scenario: { scenario: string; position: string; vsPosition: string | null } | null,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): number {
    const aggroAction = validActions.find(a => a.type === 'raise' || a.type === 'bet');
    const minAmount = aggroAction?.minAmount ?? BB_CENTS * 2;
    const maxAmount = aggroAction?.maxAmount ?? BB_CENTS * 100;

    if (scenario) {
      const chartData = this.charts.getScenario(scenario.scenario, scenario.position, scenario.vsPosition);
      if (chartData && chartData.betSizeBB > 0) {
        const exact = Math.round(chartData.betSizeBB * BB_CENTS);
        return Math.max(minAmount, Math.min(exact, maxAmount));
      }
    }

    // No chart data — all-in
    return maxAmount;
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
        const size = this.getPreflopRaiseCents(null, validActions);
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
