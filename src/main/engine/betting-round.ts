import type { Action, ActionType, Player } from '../../shared/types';
import { BB_CENTS } from '../../shared/constants';

export interface BettingRoundState {
  /** Current highest bet in this round (cents). */
  currentBet: number;
  /** Minimum raise TO amount (cents). */
  minRaiseTo: number;
  /** The size of the last raise increment (cents), used to calculate next min raise. */
  lastRaiseSize: number;
  /** Whether the round is complete. */
  isComplete: boolean;
  /** Number of active players (not folded, not all-in who have matched). */
  activePlayers: number;
}

/**
 * Manages a single betting round (preflop, flop, turn, or river).
 *
 * Tracks who has acted, the current bet to match, minimum raise sizing,
 * and determines when the round is complete.
 */
export class BettingRound {
  private currentBet: number = 0;
  private lastRaiseSize: number = 0;
  private minRaiseTo: number = 0;
  private actedPlayers: Set<number> = new Set();
  private foldedPlayers: Set<number> = new Set();
  private allInPlayers: Set<number> = new Set();
  private playerBets: Map<number, number> = new Map(); // Per-round bets
  private actionOrder: number[]; // Seat indices in action order
  private currentActorIdx: number = 0;
  private isPreflop: boolean;

  constructor(
    players: Player[],
    isPreflop: boolean,
    buttonSeatIndex: number
  ) {
    this.isPreflop = isPreflop;

    // Build action order based on active players
    const activePlayers = players.filter(p => p.isActive && !p.isSittingOut);
    this.actionOrder = this.buildActionOrder(activePlayers, buttonSeatIndex, isPreflop);

    // Initialize player bets to 0
    for (const p of activePlayers) {
      this.playerBets.set(p.seatIndex, 0);
    }

    // Track already folded/sitting-out players
    for (const p of players) {
      if (!p.isActive || p.isSittingOut) {
        this.foldedPlayers.add(p.seatIndex);
      }
    }
  }

  /**
   * Build the order of action for this round.
   * Preflop: UTG first (seat after BB), ending with BB.
   * Postflop: first active player left of button.
   */
  private buildActionOrder(
    activePlayers: Player[],
    buttonSeatIndex: number,
    isPreflop: boolean
  ): number[] {
    const seats = activePlayers.map(p => p.seatIndex).sort((a, b) => a - b);
    const n = seats.length;
    if (n === 0) return [];

    // Find the button position in the seat array
    let buttonIdx = seats.indexOf(buttonSeatIndex);
    if (buttonIdx === -1) {
      // Button is sitting out; find the closest seat before button position
      for (let i = seats.length - 1; i >= 0; i--) {
        if (seats[i] <= buttonSeatIndex) {
          buttonIdx = i;
          break;
        }
      }
      if (buttonIdx === -1) buttonIdx = seats.length - 1;
    }

    if (isPreflop) {
      // Preflop: SB = next after button, BB = next after SB, UTG = next after BB
      // Action starts at UTG (3rd seat after button)
      const utg = (buttonIdx + 3) % n;
      const order: number[] = [];
      for (let i = 0; i < n; i++) {
        order.push(seats[(utg + i) % n]);
      }
      return order;
    } else {
      // Postflop: first active seat after button
      const firstActor = (buttonIdx + 1) % n;
      const order: number[] = [];
      for (let i = 0; i < n; i++) {
        order.push(seats[(firstActor + i) % n]);
      }
      return order;
    }
  }

  /**
   * Post blinds. Call this before starting the round for preflop.
   * Returns the actions that were taken.
   */
  postBlinds(
    sbSeatIndex: number,
    bbSeatIndex: number,
    sbAmount: number,
    bbAmount: number,
    players: Player[]
  ): Action[] {
    const actions: Action[] = [];

    // SB posts
    const sbPlayer = players.find(p => p.seatIndex === sbSeatIndex);
    const actualSb = sbPlayer ? Math.min(sbAmount, sbPlayer.stack) : sbAmount;
    this.playerBets.set(sbSeatIndex, actualSb);
    actions.push({ playerSeatIndex: sbSeatIndex, type: 'post_sb', amount: actualSb, timestamp: Date.now() });

    // BB posts
    const bbPlayer = players.find(p => p.seatIndex === bbSeatIndex);
    const actualBb = bbPlayer ? Math.min(bbAmount, bbPlayer.stack) : bbAmount;
    this.playerBets.set(bbSeatIndex, actualBb);
    actions.push({ playerSeatIndex: bbSeatIndex, type: 'post_bb', amount: actualBb, timestamp: Date.now() });

    this.currentBet = actualBb;
    this.lastRaiseSize = actualBb; // The BB is the initial "raise" size
    this.minRaiseTo = actualBb * 2; // Min raise is to 2bb

    // Check if either blind was a short all-in
    if (sbPlayer && actualSb >= sbPlayer.stack) {
      this.allInPlayers.add(sbSeatIndex);
    }
    if (bbPlayer && actualBb >= bbPlayer.stack) {
      this.allInPlayers.add(bbSeatIndex);
    }

    return actions;
  }

  /**
   * Initialize a postflop round (no blinds).
   */
  initPostflop(): void {
    this.currentBet = 0;
    this.lastRaiseSize = BB_CENTS; // Default min raise size = 1bb
    this.minRaiseTo = BB_CENTS;
  }

  /**
   * Get the seat index of the next player to act, or null if the round is complete.
   */
  getNextActor(players: Player[]): number | null {
    if (this.isRoundComplete()) return null;

    // Walk through action order to find next eligible actor
    for (let attempts = 0; attempts < this.actionOrder.length * 2; attempts++) {
      const seat = this.actionOrder[this.currentActorIdx % this.actionOrder.length];

      // Skip folded, all-in, and sitting out players
      if (
        this.foldedPlayers.has(seat) ||
        this.allInPlayers.has(seat)
      ) {
        this.currentActorIdx++;
        continue;
      }

      const player = players.find(p => p.seatIndex === seat);
      if (!player || !player.isActive || player.isSittingOut) {
        this.currentActorIdx++;
        continue;
      }

      // Check if this player needs to act
      const playerBet = this.playerBets.get(seat) ?? 0;
      const needsToAct = !this.actedPlayers.has(seat) || playerBet < this.currentBet;

      if (needsToAct) {
        return seat;
      }

      this.currentActorIdx++;
    }

    return null;
  }

  /**
   * Get valid actions for the player at the given seat.
   */
  getValidActions(seatIndex: number, playerStack: number): { type: ActionType; minAmount: number; maxAmount: number }[] {
    const playerBet = this.playerBets.get(seatIndex) ?? 0;
    const toCall = this.currentBet - playerBet;
    const totalAvailable = playerStack; // Stack doesn't include current bet in this round
    const actions: { type: ActionType; minAmount: number; maxAmount: number }[] = [];

    if (toCall > 0) {
      // Facing a bet — can fold, call, or raise
      actions.push({ type: 'fold', minAmount: 0, maxAmount: 0 });

      const callAmount = Math.min(toCall, totalAvailable);
      actions.push({ type: 'call', minAmount: callAmount, maxAmount: callAmount });

      // Can raise if we have more than the call amount
      if (totalAvailable > toCall) {
        const minRaiseTotal = Math.min(this.minRaiseTo, playerBet + totalAvailable);
        const maxRaiseTotal = playerBet + totalAvailable; // all-in
        actions.push({ type: 'raise', minAmount: minRaiseTotal, maxAmount: maxRaiseTotal });
      }
    } else {
      // No bet to face — can check or bet
      actions.push({ type: 'check', minAmount: 0, maxAmount: 0 });

      if (totalAvailable > 0) {
        const minBet = Math.min(BB_CENTS, totalAvailable);
        actions.push({ type: 'bet', minAmount: minBet, maxAmount: totalAvailable });
      }
    }

    return actions;
  }

  /**
   * Apply a player's action. Validates and updates state.
   * Returns the effective amount (in cents) deducted from the player's stack.
   */
  applyAction(seatIndex: number, type: ActionType, amount: number, playerStack: number): number {
    const playerBet = this.playerBets.get(seatIndex) ?? 0;

    switch (type) {
      case 'fold': {
        this.foldedPlayers.add(seatIndex);
        this.actedPlayers.add(seatIndex);
        this.currentActorIdx++;
        return 0;
      }

      case 'check': {
        if (this.currentBet > playerBet) {
          throw new Error(`Cannot check when facing a bet of ${this.currentBet} (player bet: ${playerBet})`);
        }
        this.actedPlayers.add(seatIndex);
        this.currentActorIdx++;
        return 0;
      }

      case 'call': {
        const toCall = Math.min(this.currentBet - playerBet, playerStack);
        this.playerBets.set(seatIndex, playerBet + toCall);
        this.actedPlayers.add(seatIndex);
        if (toCall >= playerStack) {
          this.allInPlayers.add(seatIndex);
        }
        this.currentActorIdx++;
        return toCall;
      }

      case 'bet': {
        if (this.currentBet > 0) {
          throw new Error('Cannot bet when there is already a bet — use raise');
        }
        const betAmount = Math.min(amount, playerStack);
        this.playerBets.set(seatIndex, betAmount);
        this.currentBet = betAmount;
        this.lastRaiseSize = betAmount;
        this.minRaiseTo = betAmount * 2;
        this.actedPlayers.add(seatIndex);
        if (betAmount >= playerStack) {
          this.allInPlayers.add(seatIndex);
        }
        // Reset acted for others (they need to respond to the bet)
        this.reopenAction(seatIndex);
        this.currentActorIdx++;
        return betAmount;
      }

      case 'raise': {
        const raiseToAmount = Math.min(amount, playerBet + playerStack);
        const additionalCost = raiseToAmount - playerBet;
        const raiseIncrement = raiseToAmount - this.currentBet;

        // Check if this is a full raise (reopens action) or a short all-in
        const isFullRaise = raiseIncrement >= this.lastRaiseSize;

        this.playerBets.set(seatIndex, raiseToAmount);

        if (isFullRaise) {
          this.lastRaiseSize = raiseIncrement;
          this.minRaiseTo = raiseToAmount + raiseIncrement;
          // Reopen action for all players who already acted
          this.reopenAction(seatIndex);
        }
        // Short all-in: does NOT reopen action

        this.currentBet = raiseToAmount;
        this.actedPlayers.add(seatIndex);

        if (additionalCost >= playerStack) {
          this.allInPlayers.add(seatIndex);
        }

        this.currentActorIdx++;
        return additionalCost;
      }

      default:
        throw new Error(`Unexpected action type in betting round: ${type}`);
    }
  }

  /** Reopen action for all players except the actor and folded/all-in. */
  private reopenAction(actorSeat: number): void {
    for (const seat of this.actionOrder) {
      if (seat !== actorSeat && !this.foldedPlayers.has(seat) && !this.allInPlayers.has(seat)) {
        this.actedPlayers.delete(seat);
      }
    }
  }

  /** Check if the betting round is over. */
  isRoundComplete(): boolean {
    // Count active non-folded players
    const activePlayers = this.actionOrder.filter(
      s => !this.foldedPlayers.has(s)
    );

    // Only one player left — everyone else folded
    if (activePlayers.length <= 1) return true;

    // All active non-all-in players have acted and matched
    const playersWhoCanAct = activePlayers.filter(
      s => !this.allInPlayers.has(s)
    );

    if (playersWhoCanAct.length === 0) return true; // Everyone is all-in
    if (playersWhoCanAct.length === 1) {
      // Only one player who can still act
      const seat = playersWhoCanAct[0];
      const bet = this.playerBets.get(seat) ?? 0;
      // If they've matched or there's no one to play against, round is complete
      if (this.actedPlayers.has(seat) && bet >= this.currentBet) return true;
      // If all others are all-in/folded and this player has matched, done
      const othersAllIn = activePlayers.filter(s => s !== seat).every(s => this.allInPlayers.has(s));
      if (othersAllIn && bet >= this.currentBet && this.actedPlayers.has(seat)) return true;
    }

    // All players who can act have acted and matched the current bet
    return playersWhoCanAct.every(seat => {
      const bet = this.playerBets.get(seat) ?? 0;
      return this.actedPlayers.has(seat) && bet >= this.currentBet;
    });
  }

  /** Count non-folded players. */
  getActivePlayerCount(): number {
    return this.actionOrder.filter(s => !this.foldedPlayers.has(s)).length;
  }

  /** Get current bet amounts per player this round. */
  getPlayerBets(): Map<number, number> {
    return new Map(this.playerBets);
  }

  /** Get the current bet to match. */
  getCurrentBet(): number {
    return this.currentBet;
  }

  /** Get the minimum raise TO amount. */
  getMinRaiseTo(): number {
    return this.minRaiseTo;
  }

  /** Get folded player set (for external checks). */
  getFoldedPlayers(): Set<number> {
    return new Set(this.foldedPlayers);
  }

  /** Get all-in player set (for external checks). */
  getAllInPlayers(): Set<number> {
    return new Set(this.allInPlayers);
  }
}
