import type {
  Action, ActionType, ActionFrequency, Card, HandState, Player, PlayerSnapshot,
  SidePot, Street, TableSnapshot, WinnerInfo, AvailableAction
} from '../../shared/types';
import {
  BB_CENTS, SB_CENTS, STARTING_STACK_CENTS, MAX_SEATS,
  ACTION_TIMEOUT_SECONDS, PAUSE_BETWEEN_HANDS_MS, cardToString, centsToDollars
} from '../../shared/constants';
import { createDeck, shuffle, shuffleSeeded, deal, burn } from './deck';
import { BettingRound } from './betting-round';
import { PotManager } from './pot-manager';
import { resolveShowdown, resolveNoShowdown } from './showdown';
import type { GameEngineConfig, ActionProvider } from './types';
import { PreflopCharts } from '../bot/preflop-charts';

// 6-max position labels in clockwise order from button
const POSITION_LABELS_6MAX = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'] as const;

/** Determine feedback result for a hero preflop action vs the GTO chart. */
function computePreflopFeedback(
  heroAction: ActionType,
  freqs: ActionFrequency,
  rng: number  // 0–99
): 'correct' | 'mixing' | 'ev_loss' {
  const actionFreq = (freqs[heroAction as keyof ActionFrequency] ?? 0);
  if (actionFreq < 0.001) return 'ev_loss';

  // Assign cumulative RNG ranges: most aggressive → least
  const order: (keyof ActionFrequency)[] = ['raise', 'allIn', 'call', 'check', 'fold'];
  let cursor = 0;
  for (const key of order) {
    const f = freqs[key] ?? 0;
    if (f > 0.001) {
      const threshold = Math.round(cursor + f * 100);
      if (heroAction === key) {
        return (rng >= cursor && rng < threshold) ? 'correct' : 'mixing';
      }
      cursor = threshold;
    }
  }
  return 'mixing';
}

export class GameEngine {
  private config: GameEngineConfig;
  private players: Player[] = [];
  private buttonSeatIndex: number = 0;
  private handCounter: number = 0;
  private running: boolean = false;
  private currentHandState: HandState | null = null;
  private potManager: PotManager = new PotManager();
  private preflopRng: number = 0;
  private zoomFastMode: boolean = false;

  /** True while running the tail of a hand at 0-delay after hero folded in zoom mode. */
  get isZoomFastMode(): boolean { return this.zoomFastMode; }

  /** Called by TableManager when hero folds in zoom mode. */
  enterZoomFastMode(): void { this.zoomFastMode = true; }

  /** Update bot display names mid-session (zoom: new table feel each hand). */
  rerollBotNames(newNames: string[]): void {
    for (let i = 1; i < MAX_SEATS; i++) {
      const name = newNames[i - 1];
      if (name) this.players[i].name = name;
    }
  }

  constructor(config: GameEngineConfig) {
    this.config = config;
    this.initPlayers();
  }

  private initPlayers(): void {
    for (let i = 0; i < MAX_SEATS; i++) {
      this.players.push({
        seatIndex: i,
        name: this.config.playerNames[i] ?? `Player${i}`,
        stack: STARTING_STACK_CENTS,
        holeCards: null,
        isHuman: i === this.config.humanSeatIndex,
        isActive: true,
        isSittingOut: false,
        currentBet: 0,
        hasActed: false,
        position: 'BTN' // Will be assigned per hand
      });
    }
  }

  /** Start the game loop. Runs hands continuously until stopped. */
  async start(): Promise<void> {
    this.running = true;
    // Set initial button (seat before the human so human is not always BTN)
    this.buttonSeatIndex = (this.config.humanSeatIndex + MAX_SEATS - 1) % MAX_SEATS;

    while (this.running) {
      await this.playHand();
      const wasFastMode = this.zoomFastMode;
      this.zoomFastMode = false; // Reset before next hand
      if (this.running && !wasFastMode) {
        await this.delay(PAUSE_BETWEEN_HANDS_MS);
      }
    }
  }

  /** Stop the game loop after the current hand. */
  stop(): void {
    this.running = false;
  }

  /** Play a single complete hand. Can be called directly for testing. */
  async playHand(): Promise<HandState> {
    this.handCounter++;
    const handId = String(this.handCounter);

    // Generate a per-hand RNG (0–99) used for preflop feedback comparisons
    this.preflopRng = Math.floor(Math.random() * 100);

    // 1. Reset stacks and state
    this.resetForNewHand();

    // 2. Rotate button
    this.rotateButton();

    // 3. Assign positions
    this.assignPositions();

    // 4. Shuffle deck
    const deck = this.config.seed !== undefined
      ? shuffleSeeded(createDeck(), this.config.seed + this.handCounter)
      : shuffle(createDeck());

    // 5. Initialize hand state
    const handState: HandState = {
      handId,
      tableId: this.config.tableId,
      buttonSeatIndex: this.buttonSeatIndex,
      players: this.players.map(p => ({ ...p })),
      deck: [...deck],
      communityCards: [],
      street: 'preflop',
      pot: 0,
      sidePots: [],
      actions: [],
      currentPlayerIndex: -1,
      minRaise: BB_CENTS * 2,
      isComplete: false
    };

    this.currentHandState = handState;
    this.potManager.reset();

    // 6. Deal hole cards
    let remainingDeck = deck;
    for (const player of this.players) {
      const { dealt, remaining } = deal(remainingDeck, 2);
      remainingDeck = remaining;
      player.holeCards = [dealt[0], dealt[1]];
      handState.players[player.seatIndex].holeCards = player.holeCards;
    }
    handState.deck = remainingDeck;

    this.emitSound('deal');
    this.emitSnapshot(handState);

    // 7. Post blinds and run preflop
    const sbSeat = this.getSBSeat();
    const bbSeat = this.getBBSeat();
    const preflopRound = new BettingRound(this.players, true, this.buttonSeatIndex);
    const blindActions = preflopRound.postBlinds(sbSeat, bbSeat, SB_CENTS, BB_CENTS, this.players);

    for (const action of blindActions) {
      this.applyBlindAction(action, handState);
    }
    this.emitSnapshot(handState);

    // Run preflop betting
    const preflopComplete = await this.runBettingRound(preflopRound, handState, 'preflop');
    if (preflopComplete === 'hand_over') {
      return await this.finishHand(handState);
    }

    // Collect bets into pot after preflop
    this.collectBets(handState);

    // All-in runout: if no further betting is possible, deal remaining streets with delays
    if (!this.needsBetting()) {
      return this.runAllInRunout(handState);
    }

    // 8. Flop — brief pause before dealing
    await this.streetDelay();
    const burnResult1 = burn(handState.deck);
    handState.deck = burnResult1.remaining;
    const flopDeal = deal(handState.deck, 3);
    handState.deck = flopDeal.remaining;
    handState.communityCards = flopDeal.dealt;
    handState.street = 'flop';
    this.emitSound('card-flip');
    this.emitSnapshot(handState);

    const flopRound = new BettingRound(this.getActivePlayers(), false, this.buttonSeatIndex);
    flopRound.initPostflop();
    const flopComplete = await this.runBettingRound(flopRound, handState, 'flop');
    if (flopComplete === 'hand_over') {
      return await this.finishHand(handState);
    }
    this.collectBets(handState);

    // Check again after flop betting
    if (!this.needsBetting()) {
      return this.runAllInRunout(handState);
    }

    // 9. Turn — brief pause before dealing
    await this.streetDelay();
    const burnResult2 = burn(handState.deck);
    handState.deck = burnResult2.remaining;
    const turnDeal = deal(handState.deck, 1);
    handState.deck = turnDeal.remaining;
    handState.communityCards.push(turnDeal.dealt[0]);
    handState.street = 'turn';
    this.emitSound('card-flip');
    this.emitSnapshot(handState);

    const turnRound = new BettingRound(this.getActivePlayers(), false, this.buttonSeatIndex);
    turnRound.initPostflop();
    const turnComplete = await this.runBettingRound(turnRound, handState, 'turn');
    if (turnComplete === 'hand_over') {
      return await this.finishHand(handState);
    }
    this.collectBets(handState);

    // Check again after turn betting
    if (!this.needsBetting()) {
      return this.runAllInRunout(handState);
    }

    // 10. River — brief pause before dealing
    await this.streetDelay();
    const burnResult3 = burn(handState.deck);
    handState.deck = burnResult3.remaining;
    const riverDeal = deal(handState.deck, 1);
    handState.deck = riverDeal.remaining;
    handState.communityCards.push(riverDeal.dealt[0]);
    handState.street = 'river';
    this.emitSound('card-flip');
    this.emitSnapshot(handState);

    const riverRound = new BettingRound(this.getActivePlayers(), false, this.buttonSeatIndex);
    riverRound.initPostflop();
    const riverComplete = await this.runBettingRound(riverRound, handState, 'river');
    if (riverComplete === 'hand_over') {
      return await this.finishHand(handState);
    }
    this.collectBets(handState);

    // 11. Showdown
    return this.resolveShowdownAndFinish(handState);
  }

  private async runBettingRound(
    round: BettingRound,
    handState: HandState,
    street: Street
  ): Promise<'continue' | 'hand_over'> {
    while (true) {
      const activePlayers = this.getActivePlayers();
      if (activePlayers.length <= 1) return 'hand_over';

      const nextActor = round.getNextActor(this.players);
      if (nextActor === null) break;

      handState.currentPlayerIndex = nextActor;
      const player = this.players[nextActor];
      let validActions = round.getValidActions(nextActor, player.stack);

      // No limping: preflop before any raise, remove 'call' so players must raise or fold
      if (street === 'preflop' && !handState.actions.some(a => a.type === 'raise')) {
        validActions = validActions.filter(a => a.type !== 'call');
      }

      // Build available actions for the human player's UI
      const isHumanTurn = nextActor === this.config.humanSeatIndex;
      // Compute live pot: collected pot + all current street bets
      const livePot = handState.pot + this.players.reduce((sum, p) => sum + p.currentBet, 0);
      const uiActions: AvailableAction[] | null = isHumanTurn
        ? this.buildAvailableActions(validActions, livePot, handState, player.position)
        : null;

      this.emitSnapshot(handState, uiActions);

      // Get action from provider
      const { type, amount } = await this.config.actionProvider.getAction(
        { ...handState, players: this.players.map(p => ({ ...p })) },
        nextActor,
        validActions
      );

      // Apply action
      const cost = round.applyAction(nextActor, type as ActionType, amount, player.stack);
      player.stack -= cost;
      player.currentBet += cost;

      if (type === 'fold') {
        player.isActive = false;
        this.potManager.markFolded(nextActor);
      }

      if (cost > 0) {
        this.potManager.addBet(nextActor, cost);
      }

      // Record action
      const action: Action = {
        playerSeatIndex: nextActor,
        type: type as ActionType,
        amount: cost,
        timestamp: Date.now()
      };
      handState.actions.push(action);

      // Preflop feedback for the human player
      if (
        street === 'preflop' &&
        nextActor === this.config.humanSeatIndex &&
        this.config.charts &&
        this.config.onPreflopFeedback &&
        player.holeCards
      ) {
        // Classify scenario from history BEFORE this action (slice off the last entry)
        const historyBeforeAction = handState.actions.slice(0, -1).map(a => ({
          type: a.type,
          playerPosition: this.players[a.playerSeatIndex]?.position ?? 'UTG'
        }));
        const scenario = PreflopCharts.classifyScenario(historyBeforeAction, player.position);
        const canonicalHand = PreflopCharts.getCanonicalHand(player.holeCards[0], player.holeCards[1]);

        if (scenario) {
          const freqs = this.config.charts.getFrequencies(
            scenario.scenario, scenario.position, scenario.vsPosition, canonicalHand
          );
          if (freqs) {
            const result = computePreflopFeedback(type as ActionType, freqs, this.preflopRng);
            this.config.onPreflopFeedback(this.config.tableId, {
              result,
              canonicalHand,
              frequencies: freqs,
              rng: this.preflopRng,
              heroAction: type as ActionType,
            });
          }
        }
      }

      // Emit sound
      this.emitActionSound(type as ActionType);
      this.emitSnapshot(handState);
    }

    // Check if only one player remains
    if (this.getActivePlayers().length <= 1) return 'hand_over';
    return 'continue';
  }

  private applyBlindAction(action: Action, handState: HandState): void {
    const player = this.players[action.playerSeatIndex];
    player.stack -= action.amount;
    player.currentBet = action.amount;
    this.potManager.addBet(action.playerSeatIndex, action.amount);
    handState.actions.push(action);
    // Don't add to handState.pot here — collectBets will handle it
  }

  private collectBets(handState: HandState): void {
    let totalBets = 0;
    for (const player of this.players) {
      totalBets += player.currentBet;
      player.currentBet = 0;
    }
    handState.pot += totalBets;
  }

  /** Deal remaining community cards with delays (no betting), then go to showdown. */
  private async runAllInRunout(handState: HandState): Promise<HandState> {
    this.collectBets(handState);

    // Deal remaining streets
    const cardsNeeded = 5 - handState.communityCards.length;

    if (cardsNeeded >= 3 && handState.communityCards.length === 0) {
      // Deal flop
      await this.streetDelay();
      const b = burn(handState.deck);
      handState.deck = b.remaining;
      const f = deal(handState.deck, 3);
      handState.deck = f.remaining;
      handState.communityCards = f.dealt;
      handState.street = 'flop';
      this.emitSound('card-flip');
      this.emitSnapshot(handState);
    }

    if (handState.communityCards.length === 3) {
      // Deal turn
      await this.streetDelay();
      const b = burn(handState.deck);
      handState.deck = b.remaining;
      const t = deal(handState.deck, 1);
      handState.deck = t.remaining;
      handState.communityCards.push(t.dealt[0]);
      handState.street = 'turn';
      this.emitSound('card-flip');
      this.emitSnapshot(handState);
    }

    if (handState.communityCards.length === 4) {
      // Deal river
      await this.streetDelay();
      const b = burn(handState.deck);
      handState.deck = b.remaining;
      const r = deal(handState.deck, 1);
      handState.deck = r.remaining;
      handState.communityCards.push(r.dealt[0]);
      handState.street = 'river';
      this.emitSound('card-flip');
      this.emitSnapshot(handState);
    }

    return this.resolveShowdownAndFinish(handState);
  }

  private resolveShowdownAndFinish(handState: HandState): HandState {
    const activePlayers = this.getActivePlayers();
    const pots = this.potManager.calculatePots();

    // Position order for odd chip: start from SB clockwise
    const posOrder = this.getPositionOrder();

    const result = resolveShowdown(activePlayers, handState.communityCards, pots, posOrder);

    // Apply winnings
    for (const [seat, amount] of result.awards) {
      this.players[seat].stack += amount;
    }

    handState.sidePots = pots;
    handState.isComplete = true;



    // Emit showdown snapshot with winner info and revealed cards
    const snapshot = this.createSnapshot(handState, true, result.winners);
    this.config.onSnapshot(this.config.tableId, snapshot);

    if (this.config.onHandComplete) {
      this.config.onHandComplete(this.config.tableId, handState);
    }

    return handState;
  }

  private async finishHand(handState: HandState): Promise<HandState> {
    const activePlayers = this.getActivePlayers();
    const totalPot = this.potManager.getTotalPot();

    // Collect any remaining bets
    this.collectBets(handState);

    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const result = resolveNoShowdown(winner.seatIndex, handState.pot > 0 ? handState.pot : totalPot, this.players);

      for (const [seat, amount] of result.awards) {
        this.players[seat].stack += amount;
      }

      handState.isComplete = true;
      this.emitSound('chips-collect');

      const snapshot = this.createSnapshot(handState, false, result.winners);
      this.config.onSnapshot(this.config.tableId, snapshot);

      if (this.config.onHandComplete) {
        this.config.onHandComplete(this.config.tableId, handState);
      }

      return handState;
    }

    // Multiple players, all-in — run out remaining board then showdown
    return this.runAllInRunout(handState);
  }

  private resetForNewHand(): void {
    for (const player of this.players) {
      player.stack = STARTING_STACK_CENTS;
      player.holeCards = null;
      player.isActive = true;
      player.isSittingOut = false;
      player.currentBet = 0;
      player.hasActed = false;
    }
  }

  private rotateButton(): void {
    this.buttonSeatIndex = (this.buttonSeatIndex + 1) % MAX_SEATS;
  }

  private assignPositions(): void {
    for (let i = 0; i < MAX_SEATS; i++) {
      const offset = (i - this.buttonSeatIndex + MAX_SEATS) % MAX_SEATS;
      this.players[i].position = POSITION_LABELS_6MAX[offset];
    }
  }

  private getSBSeat(): number {
    return (this.buttonSeatIndex + 1) % MAX_SEATS;
  }

  private getBBSeat(): number {
    return (this.buttonSeatIndex + 2) % MAX_SEATS;
  }

  private getActivePlayers(): Player[] {
    return this.players.filter(p => p.isActive && !p.isSittingOut);
  }

  /** True when no further betting is possible (all active players are all-in, or at most 1 has chips). */
  private needsBetting(): boolean {
    const playersWithChips = this.getActivePlayers().filter(p => p.stack > 0);
    return playersWithChips.length >= 2;
  }

  private getPositionOrder(): number[] {
    // SB first, then clockwise
    const order: number[] = [];
    for (let i = 1; i <= MAX_SEATS; i++) {
      order.push((this.buttonSeatIndex + i) % MAX_SEATS);
    }
    return order;
  }

  private createSnapshot(
    handState: HandState,
    isShowdown: boolean,
    winnerInfo: WinnerInfo[] | null = null,
    availableActions: AvailableAction[] | null = null
  ): TableSnapshot {
    const players: PlayerSnapshot[] = this.players.map(p => ({
      seatIndex: p.seatIndex,
      name: p.name,
      stack: p.stack,
      // Show human cards always; show bot cards at showdown or when revealBotCards is on
      holeCards: p.isHuman || isShowdown || this.config.revealBotCards ? p.holeCards : null,
      isActive: p.isActive,
      currentBet: p.currentBet,
      position: p.position,
      isCurrentActor: p.seatIndex === handState.currentPlayerIndex
    }));

    return {
      handId: handState.handId,
      tableId: handState.tableId,
      players,
      communityCards: [...handState.communityCards],
      pot: handState.pot,
      sidePots: handState.sidePots,
      street: handState.street,
      currentPlayerIndex: handState.currentPlayerIndex,
      buttonSeatIndex: handState.buttonSeatIndex,
      isHandComplete: handState.isComplete,
      lastAction: handState.actions.length > 0 ? handState.actions[handState.actions.length - 1] : null,
      winnerInfo,
      timeRemaining: ACTION_TIMEOUT_SECONDS,
      availableActions,
      zoomMode: this.config.zoomMode ?? false,
      preflopRng: (handState.street === 'preflop' && availableActions) ? this.preflopRng : null,
      heroHasActed: handState.actions.some(
        a => a.playerSeatIndex === this.config.humanSeatIndex
          && a.type !== 'post_sb' && a.type !== 'post_bb'
      ),
    };
  }

  private emitSnapshot(handState: HandState, availableActions?: AvailableAction[] | null): void {
    const snapshot = this.createSnapshot(handState, false, null, availableActions ?? null);
    // Include current street bets in the displayed pot
    snapshot.pot = handState.pot + this.players.reduce((sum, p) => sum + p.currentBet, 0);
    this.config.onSnapshot(this.config.tableId, snapshot);
  }

  private emitSound(sound: string): void {
    this.config.onSound?.(this.config.tableId, sound);
  }

  private emitActionSound(type: ActionType): void {
    const soundMap: Record<string, string> = {
      fold: 'fold', check: 'check', call: 'call',
      bet: 'bet', raise: 'raise'
    };
    const sound = soundMap[type];
    if (sound) this.emitSound(sound);
  }

  /**
   * Convert engine-level valid actions into AvailableAction[] for the renderer.
   * These become the discrete action buttons the human can click.
   *
   * Preflop: when a chart scenario is matched, bet/raise uses the fixed betSizeBB
   * from the chart (minAmount === maxAmount → no presets shown in ActionButtons).
   * Postflop: uses a 67% pot default with the full min/max range (presets shown).
   */
  private buildAvailableActions(
    validActions: { type: string; minAmount: number; maxAmount: number }[],
    pot: number,
    handState?: HandState,
    actingPosition?: string
  ): AvailableAction[] {
    const result: AvailableAction[] = [];

    // Preflop: look up fixed sizing from chart
    let preflopFixedCents: number | null = null;
    if (handState?.street === 'preflop' && actingPosition && this.config.charts) {
      const actionHistory = handState.actions.map(a => ({
        type: a.type,
        playerPosition: this.players[a.playerSeatIndex]?.position ?? 'UTG'
      }));
      const scenario = PreflopCharts.classifyScenario(actionHistory, actingPosition);
      if (scenario) {
        const chartData = this.config.charts.getScenario(
          scenario.scenario, scenario.position, scenario.vsPosition
        );
        if (chartData && chartData.betSizeBB > 0) {
          preflopFixedCents = Math.round(chartData.betSizeBB * BB_CENTS);
        }
      }
    }

    for (const va of validActions) {
      switch (va.type) {
        case 'fold':
          result.push({ type: 'fold', amount: 0, solverNodeId: '', label: 'FOLD' });
          break;
        case 'check':
          result.push({ type: 'check', amount: 0, solverNodeId: '', label: 'CHECK' });
          break;
        case 'call':
          result.push({
            type: 'call', amount: va.minAmount, solverNodeId: '',
            label: `CALL ${centsToDollars(va.minAmount)}`
          });
          break;
        case 'bet': {
          if (preflopFixedCents !== null) {
            const fixed = Math.max(va.minAmount, Math.min(preflopFixedCents, va.maxAmount));
            result.push({
              type: 'bet', amount: fixed,
              minAmount: fixed, maxAmount: fixed,
              solverNodeId: '', label: `BET ${centsToDollars(fixed)}`
            });
          } else {
            const defaultSize = pot > 0
              ? Math.max(va.minAmount, Math.min(Math.round(pot * 0.67), va.maxAmount))
              : va.minAmount;
            result.push({
              type: 'bet', amount: defaultSize,
              minAmount: va.minAmount, maxAmount: va.maxAmount,
              solverNodeId: '', label: `BET ${centsToDollars(defaultSize)}`
            });
          }
          break;
        }
        case 'raise': {
          if (preflopFixedCents !== null) {
            const fixed = Math.max(va.minAmount, Math.min(preflopFixedCents, va.maxAmount));
            result.push({
              type: 'raise', amount: fixed,
              minAmount: fixed, maxAmount: fixed,
              solverNodeId: '', label: `RAISE ${centsToDollars(fixed)}`
            });
          } else {
            const defaultSize = pot > 0
              ? Math.max(va.minAmount, Math.min(Math.round(pot * 0.67), va.maxAmount))
              : va.minAmount;
            result.push({
              type: 'raise', amount: defaultSize,
              minAmount: va.minAmount, maxAmount: va.maxAmount,
              solverNodeId: '', label: `RAISE ${centsToDollars(defaultSize)}`
            });
          }
          break;
        }
      }
    }

    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Delay before dealing a new street. Skipped in test mode (seed is set). */
  private streetDelay(): Promise<void> {
    if (this.zoomFastMode) return Promise.resolve();
    if (this.config.seed !== undefined) return Promise.resolve();
    return this.delay(800);
  }

  // Accessors for testing
  getPlayers(): Player[] { return this.players; }
  getButtonSeatIndex(): number { return this.buttonSeatIndex; }
  getHandCounter(): number { return this.handCounter; }
}
