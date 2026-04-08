import type {
  Action, ActionType, ActionFrequency, Card, HandState, Player, PlayerSnapshot,
  SidePot, Street, TableSnapshot, WinnerInfo, AvailableAction
} from '../../shared/types';
import type { SpotModeConfig } from './types';
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
import { buildBoardString } from '../spot-trainer/postflop-api-client';
import { computePostflopFeedback } from '../spot-trainer/postflop-feedback';
import { cardSet } from '../spot-trainer/hand-sampler';
import { selectAction } from '../bot/action-selector';
import { getBotDelay } from '../bot/timing';

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
  const order: (keyof ActionFrequency)[] = ['raise', 'allIn', 'bet', 'call', 'check', 'fold'];
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
  private prefetchedChildren: Promise<import('../spot-trainer/postflop-api-client').ApiChildrenResult | null> | null = null;
  private prefetchedStrategy: Promise<import('../spot-trainer/postflop-api-client').ApiStrategyResult | null> | null = null;

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

    if (this.config.spotMode) {
      // Spot Trainer mode: fixed button position, no preflop, no pause between hands
      const spot = this.config.spotMode;
      // Use pre-computed buttonSeatIndex from table-manager (based on actual position offsets)
      this.buttonSeatIndex = spot.buttonSeatIndex;

      while (this.running) {
        await this.playSpotHand();
      }
      return;
    }

    // Normal grind mode
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

      // Get action from provider (solverNodeId is populated when human acts in spot mode)
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

  /**
   * Play a single hand in Spot Trainer mode.
   * Skips preflop entirely — initializes pot/stacks from spot config,
   * samples hole cards, deals a random flop, then runs postflop streets.
   */
  private async playSpotHand(): Promise<void> {
    const spot = this.config.spotMode!;
    this.handCounter++;
    const handId = String(this.handCounter);

    // Per-hand RNG for postflop feedback mixing decisions
    this.preflopRng = Math.floor(Math.random() * 100);

    // 1. Reset seats — only hero and villain are active
    this.resetForNewHand();
    console.log(`[SpotOrder] hand=${handId} humanSeat=${this.config.humanSeatIndex} villainSeat=${spot.villainSeatIndex} oopSeat=${spot.oopSeatIndex} buttonSeat=${this.buttonSeatIndex} heroSide=${spot.heroSide}`);

    // 2. Assign positions based on fixed button
    this.assignPositions();

    // 3. Sample hole cards
    const dealt = spot.getHoleCards();
    if (!dealt) {
      // Sampling failed — skip this hand silently (should be very rare)
      await this.delay(500);
      return;
    }
    const { heroCards, villainCards } = dealt;

    this.players[this.config.humanSeatIndex].holeCards = heroCards;
    this.players[spot.villainSeatIndex].holeCards = villainCards;

    // 4. Select a board from the API's tree — must not conflict with hole cards
    const holeKeys = cardSet([...heroCards, ...villainCards]);
    const flop = this.selectSpotBoard(spot.boards, holeKeys);
    if (!flop) {
      console.warn('[SpotHand] Could not find a valid board — retrying');
      await this.delay(200);
      return;
    }

    // 5. Build the remaining deck (exclude hole cards + board cards)
    const allUsedKeys = new Set([...holeKeys, ...flop.map((c: Card) => `${c.rank}${c.suit}`)]);
    const remainingDeck = shuffle(createDeck().filter((c: Card) => !allUsedKeys.has(`${c.rank}${c.suit}`)));

    // 6. Initialize hand state — pot pre-loaded from spot config
    const handState: HandState = {
      handId,
      tableId: this.config.tableId,
      buttonSeatIndex: this.buttonSeatIndex,
      players: this.players.map(p => ({ ...p })),
      deck: [...remainingDeck],
      communityCards: flop,
      street: 'flop',
      pot: spot.potCents,       // Preflop already collected
      sidePots: [],
      actions: [],
      currentPlayerIndex: -1,
      minRaise: BB_CENTS * 2,
      isComplete: false
    };

    this.currentHandState = handState;
    this.potManager.reset();
    // Pre-load pot manager with the preflop pot
    this.potManager.addBet(this.config.humanSeatIndex, spot.potCents / 2);
    this.potManager.addBet(spot.villainSeatIndex, spot.potCents / 2);
    this.collectBets(handState);

    // 7. Current node tracker — shared with postflop bot controller via closure
    let currentNode = 'r:0';
    const advanceNode = (childId: string) => { if (childId) currentNode = childId; };
    this.emitSound('deal');
    this.emitSnapshot(handState);

    // Helper: collect bets into pot between streets
    const advanceStreet = () => { this.collectBets(handState); };

    // 8. Flop betting round
    const flopRound = new BettingRound(this.getActivePlayers(), false, this.buttonSeatIndex);
    flopRound.initPostflop();
    const flopComplete = await this.runSpotBettingRound(
      flopRound, handState, 'flop', spot, currentNode, advanceNode
    );
    if (flopComplete === 'hand_over') {
      await this.finishSpotHand(handState);
      return;
    }
    advanceStreet();

    if (!this.needsBetting()) {
      await this.runAllInRunout(handState);
      return;
    }

    // 9. Turn
    await this.streetDelay();
    const burnResult2 = burn(handState.deck);
    handState.deck = burnResult2.remaining;
    const turnDeal = deal(handState.deck, 1);
    handState.deck = turnDeal.remaining;
    const turnCard = turnDeal.dealt[0];
    handState.communityCards.push(turnCard);
    handState.street = 'turn';
    currentNode = `${currentNode}:${turnCard.rank}${turnCard.suit}`;
    this.emitSound('card-flip');
    this.emitSnapshot(handState);

    const turnRound = new BettingRound(this.getActivePlayers(), false, this.buttonSeatIndex);
    turnRound.initPostflop();
    const turnComplete = await this.runSpotBettingRound(
      turnRound, handState, 'turn', spot, currentNode, advanceNode
    );
    if (turnComplete === 'hand_over') {
      await this.finishSpotHand(handState);
      return;
    }
    advanceStreet();

    if (!this.needsBetting()) {
      await this.runAllInRunout(handState);
      return;
    }

    // 10. River
    await this.streetDelay();
    const burnResult3 = burn(handState.deck);
    handState.deck = burnResult3.remaining;
    const riverDeal = deal(handState.deck, 1);
    handState.deck = riverDeal.remaining;
    const riverCard = riverDeal.dealt[0];
    handState.communityCards.push(riverCard);
    handState.street = 'river';
    currentNode = `${currentNode}:${riverCard.rank}${riverCard.suit}`;
    this.emitSound('card-flip');
    this.emitSnapshot(handState);

    const riverRound = new BettingRound(this.getActivePlayers(), false, this.buttonSeatIndex);
    riverRound.initPostflop();
    const riverComplete = await this.runSpotBettingRound(
      riverRound, handState, 'river', spot, currentNode, advanceNode
    );
    if (riverComplete === 'hand_over') {
      await this.finishSpotHand(handState);
      return;
    }
    advanceStreet();

    // 11. Showdown
    this.resolveShowdownAndFinish(handState);
    // Wait so feedback + winner overlay are visible before next hand
    await this.delay(2500);
  }

  /**
   * Betting round for Spot Trainer mode.
   * Same as runBettingRound but:
   *   - For human's turn: queries API children for solver-driven buttons
   *   - After human acts: queries API for feedback
   *   - Advances the UPI tree node after each action
   */
  private async runSpotBettingRound(
    round: BettingRound,
    handState: HandState,
    street: 'flop' | 'turn' | 'river',
    spot: SpotModeConfig,
    _currentNode: string,
    advanceNode: (childId: string) => void
  ): Promise<'continue' | 'hand_over'> {
    // We track node via the advanceNode closure — read from outer scope
    // Use a local ref since closures capture by reference
    let node = _currentNode;

    while (true) {
      const activePlayers = this.getActivePlayers();
      if (activePlayers.length <= 1) return 'hand_over';

      const nextActor = round.getNextActor(this.players);
      if (nextActor === null) break;

      handState.currentPlayerIndex = nextActor;
      const player = this.players[nextActor];
      const validActions = round.getValidActions(nextActor, player.stack);
      const isHumanTurn = nextActor === this.config.humanSeatIndex;
      console.log(`[SpotOrder] ${street} actor=seat${nextActor} ${isHumanTurn ? 'HUMAN' : 'BOT'} node=${node}`);

      const livePot = handState.pot + this.players.reduce((sum, p) => sum + p.currentBet, 0);
      const board = buildBoardString(handState.communityCards);

      // Build available actions for human from API children
      let uiActions: AvailableAction[] | null = null;
      if (isHumanTurn) {
        // Emit a "waiting" snapshot immediately so the UI shows it's hero's turn
        // (clears the bot's timer/toast) while we fetch available actions from the API
        const waitSnapshot = this.createSnapshot(handState, false, null, null);
        waitSnapshot.pot = livePot;
        waitSnapshot.spotMode = true;
        this.config.onSnapshot(this.config.tableId, waitSnapshot);

        // Use prefetched children if available (started during bot's thinking delay)
        const childrenResult = this.prefetchedChildren
          ? await this.prefetchedChildren
          : await spot.apiClient.getChildren(spot.spotId, board, node);
        this.prefetchedChildren = null;
        if (childrenResult && childrenResult.actions.length > 0) {
          // Use the API's `increment` field: per-street action cost in chips.
          const apiChildren = childrenResult.actions;

          uiActions = apiChildren.map(child => {
            if (child.type === 'fold' || child.type === 'check') {
              return {
                type: child.type, amount: 0, displayAmount: 0,
                solverNodeId: child.childNodeId, label: child.type.toUpperCase(),
              } as AvailableAction;
            }
            const incrementCents = Math.round(child.increment * spot.chipToDollar * 100);
            const potFraction = livePot > 0 ? Math.round((incrementCents / livePot) * 100) : 0;
            let label: string;
            if (child.type === 'call') {
              label = `CALL $${(incrementCents / 100).toFixed(2)}`;
            } else {
              label = `${child.type === 'bet' ? 'BET' : 'RAISE'} $${(incrementCents / 100).toFixed(2)} (${potFraction}%)`;
            }
            return {
              type: child.type,
              amount: incrementCents,            // per-street for BettingRound
              displayAmount: incrementCents,      // same for display
              minAmount: incrementCents,
              maxAmount: incrementCents,
              solverNodeId: child.childNodeId,
              label,
            } as AvailableAction;
          });
        } else {
          // Fallback: build standard available actions
          uiActions = this.buildAvailableActions(validActions, livePot, handState, player.position);
        }
        // Emit snapshot with available actions + spot mode flag
        const snapshot = this.createSnapshot(handState, false, null, uiActions);
        snapshot.pot = livePot;
        snapshot.spotMode = true;
        this.config.onSnapshot(this.config.tableId, snapshot);
      } else {
        this.emitSnapshot(handState);
      }

      // Save node before action (for feedback query after human acts)
      const nodeBeforeAction = node;

      // Get action — different paths for human vs bot
      let type: string;
      let amount: number;
      let actionSolverNodeId: string | undefined;

      if (isHumanTurn) {
        // Human: wait for IPC action (includes solverNodeId from clicked button)
        const result = await this.config.actionProvider.getAction(
          { ...handState, players: this.players.map(p => ({ ...p })) },
          nextActor,
          validActions
        );
        type = result.type;
        amount = result.amount;
        actionSolverNodeId = result.solverNodeId;
      } else {
        // Bot: query API for strategy at current node
        const botHoleCards = player.holeCards;
        const apiResult = botHoleCards
          ? await spot.apiClient.getHandStrategy(
              spot.spotId, board, node,
              `${botHoleCards[0].rank}${botHoleCards[0].suit}${botHoleCards[1].rank}${botHoleCards[1].suit}`
            )
          : null;

        if (apiResult && apiResult.actions.length > 0) {
          // Weighted random selection from API frequencies
          const freqMap: Record<string, number> = {};
          for (const a of apiResult.actions) freqMap[a.label] = Math.max(0, a.frequency);
          const chosenLabel = selectAction(freqMap);
          const chosen = apiResult.actions.find(a => a.label === chosenLabel) ?? apiResult.actions[0];

          // Use the API's increment field: per-street action cost
          const incrementCents = Math.round(chosen.increment * spot.chipToDollar * 100);

          const va = validActions.find(v => v.type === chosen.type);
          if (!va) {
            console.warn(`[SpotBot] type mismatch: API=${chosen.type} validActions=[${validActions.map(v => v.type)}] node=${node}`);
            type = 'check'; amount = 0; actionSolverNodeId = undefined;
          } else if (chosen.type === 'fold') {
            type = 'fold'; amount = 0; actionSolverNodeId = chosen.childNodeId;
          } else if (chosen.type === 'check') {
            type = 'check'; amount = 0; actionSolverNodeId = chosen.childNodeId;
          } else if (chosen.type === 'call') {
            type = 'call'; amount = va.minAmount; actionSolverNodeId = chosen.childNodeId;
          } else {
            const clamped = Math.max(va.minAmount, Math.min(incrementCents, va.maxAmount));
            type = chosen.type; amount = clamped; actionSolverNodeId = chosen.childNodeId;
          }

          // Apply bot timing delay — prefetch hero's children + strategy in parallel
          const isAllIn = amount >= player.stack + player.currentBet;
          const botDelay = getBotDelay({ street, potSize: livePot, isAllIn, actionType: type as ActionType });
          // If hero acts next (not a fold/hand-ending action), start fetching
          // hero's available actions AND per-hand strategy during the bot's thinking delay
          // Prefetch hero's children + strategy during bot delay.
          // Skip for folds (hand over) and calls (round over → terminal/showdown node).
          if (actionSolverNodeId && type !== 'fold' && type !== 'call') {
            this.prefetchedChildren = spot.apiClient.getChildren(spot.spotId, board, actionSolverNodeId);
            const heroCards = this.players[this.config.humanSeatIndex].holeCards;
            if (heroCards) {
              const handStr = `${heroCards[0].rank}${heroCards[0].suit}${heroCards[1].rank}${heroCards[1].suit}`;
              this.prefetchedStrategy = spot.apiClient.getHandStrategy(spot.spotId, board, actionSolverNodeId, handStr);
            }
          }
          await this.delay(botDelay);
        } else {
          // Fallback: check or fold
          console.warn(`[SpotBot] API returned null — node=${node} board=${board}`);
          const canCheck = validActions.some(v => v.type === 'check');
          const callAction = validActions.find(v => v.type === 'call');
          if (canCheck) { type = 'check'; amount = 0; }
          else if (callAction && callAction.minAmount <= BB_CENTS * 3) {
            type = 'call'; amount = callAction.minAmount;
          } else { type = 'fold'; amount = 0; }
          actionSolverNodeId = undefined;
          await this.delay(1000 + Math.random() * 1000);
        }
      }

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

      const action: Action = {
        playerSeatIndex: nextActor,
        type: type as ActionType,
        amount: cost,
        timestamp: Date.now()
      };
      handState.actions.push(action);

      // Advance tree node using the child node ID from the chosen action
      console.log(`[SpotOrder] ${street} seat${nextActor} → ${type} amt=${amount} nodeId=${actionSolverNodeId ?? 'none'}`);
      if (actionSolverNodeId) {
        node = actionSolverNodeId;
        advanceNode(actionSolverNodeId);
      }

      // Emit action sound + snapshot IMMEDIATELY — don't block on feedback API
      this.emitActionSound(type as ActionType);
      this.emitSnapshot(handState);

      // Fire postflop feedback in background (non-blocking) so gameplay continues
      if (isHumanTurn && spot.onPostflopFeedback && player.holeCards) {
        const feedbackRng = this.preflopRng;
        const feedbackNodeId = actionSolverNodeId ?? '';
        const feedbackAction = type as ActionType;
        const feedbackHand = `${player.holeCards[0].rank}${player.holeCards[0].suit}${player.holeCards[1].rank}${player.holeCards[1].suit}`;
        const feedbackCards = PreflopCharts.getCanonicalHand(player.holeCards[0], player.holeCards[1]);
        const feedbackStreet = street;
        const feedbackTableId = this.config.tableId;

        // Use prefetched strategy if available (started during bot's thinking delay)
        const strategyPromise = this.prefetchedStrategy
          ?? spot.apiClient.getHandStrategy(spot.spotId, board, nodeBeforeAction, feedbackHand);
        this.prefetchedStrategy = null;

        strategyPromise
          .then(apiResult => {
            if (apiResult && spot.onPostflopFeedback) {
              // Compute pot in chips for pot% display
              const feedbackPotChips = spot.chipToDollar > 0
                ? Math.round(livePot / (spot.chipToDollar * 100))
                : 0;
              const feedback = computePostflopFeedback(
                feedbackAction, feedbackNodeId, apiResult.actions,
                feedbackRng, feedbackStreet, feedbackCards, spot.chipToDollar, feedbackPotChips
              );
              spot.onPostflopFeedback(feedbackTableId, feedback);
            }
          })
          .catch(() => {});
        // Generate fresh RNG for next action
        this.preflopRng = Math.floor(Math.random() * 100);
      }
    }

    if (this.getActivePlayers().length <= 1) return 'hand_over';
    return 'continue';
  }

  /** Finish a spot hand (no-showdown or runout). No hand history writing.
   *  Waits briefly so the feedback square has time to display. */
  private async finishSpotHand(handState: HandState): Promise<void> {
    await this.finishHand(handState);
    // Give the renderer time to show postflop feedback before dealing next hand
    await this.delay(2500);
  }

  private resetForNewHand(): void {
    const spot = this.config.spotMode;
    for (const player of this.players) {
      if (spot) {
        // Spot mode: only 2 active seats with preset stacks
        const isActive = player.seatIndex === this.config.humanSeatIndex
          || player.seatIndex === spot.villainSeatIndex;
        player.isActive = isActive;
        player.isSittingOut = !isActive;
        player.stack = isActive ? spot.effectiveStackCents : 0;
      } else {
        player.stack = STARTING_STACK_CENTS;
        player.isActive = true;
        player.isSittingOut = false;
      }
      player.holeCards = null;
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

  /**
   * Pick a random board string from the API's board list that doesn't
   * conflict with the hole cards already dealt.
   */
  private selectSpotBoard(boards: string[], holeKeys: Set<string>): Card[] | null {
    const indices = boards.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (const i of indices) {
      const board = boards[i];
      const cards: Card[] = [];
      let conflict = false;
      for (let j = 0; j < board.length; j += 2) {
        const rank = board[j] as Card['rank'];
        const suit = board[j + 1] as Card['suit'];
        if (holeKeys.has(`${rank}${suit}`)) { conflict = true; break; }
        cards.push({ rank, suit });
      }
      if (!conflict && cards.length === 3) return cards;
    }
    return null;
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
      // Show human cards always; show bot cards at showdown / hand complete / revealBotCards
      holeCards: p.isHuman || isShowdown || handState.isComplete || this.config.revealBotCards ? p.holeCards : null,
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
      preflopRng: ((handState.street === 'preflop' || this.config.spotMode) && availableActions) ? this.preflopRng : null,
      heroHasActed: handState.actions.some(
        a => a.playerSeatIndex === this.config.humanSeatIndex
          && a.type !== 'post_sb' && a.type !== 'post_bb'
      ),
      spotMode: !!this.config.spotMode,
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
