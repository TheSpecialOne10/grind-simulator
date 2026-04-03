import type { Action, Card, HandState, Player } from '../../shared/types';
import { cardToString, centsToDollars, STARTING_STACK_CENTS } from '../../shared/constants';

/**
 * Format a completed hand in PokerStars hand history format.
 * This is a pure function — no side effects.
 */
export function formatHand(
  handState: HandState,
  tableName: string,
  timestamp: Date
): string {
  return formatHandClean(handState, tableName, timestamp);
}

/**
 * Clean implementation that properly segments actions by street.
 */
function formatHandClean(
  handState: HandState,
  tableName: string,
  timestamp: Date
): string {
  const lines: string[] = [];
  const players = handState.players;
  const btnSeat = handState.buttonSeatIndex;
  const community = handState.communityCards;

  // ── Header ──
  lines.push(
    `PokerStars Hand #${handState.handId}: Hold'em No Limit ($0.50/$1.00 USD) - ${formatDateET(timestamp)} ET`
  );
  lines.push(
    `Table '${tableName}' 6-max Seat #${btnSeat + 1} is the button`
  );

  // ── Seats ──
  for (const p of players) {
    lines.push(`Seat ${p.seatIndex + 1}: ${p.name} (${dollars(STARTING_STACK_CENTS)} in chips)`);
  }

  // ── Segment actions by type ──
  const allActions = handState.actions;
  const blinds = allActions.filter(a => a.type === 'post_sb' || a.type === 'post_bb');
  const gameActions = allActions.filter(a => a.type !== 'post_sb' && a.type !== 'post_bb');

  // Blinds
  for (const a of blinds) {
    const name = players[a.playerSeatIndex].name;
    if (a.type === 'post_sb') {
      lines.push(`${name}: posts small blind ${dollars(a.amount)}`);
    } else {
      lines.push(`${name}: posts big blind ${dollars(a.amount)}`);
    }
  }

  // ── Hole cards ──
  lines.push('*** HOLE CARDS ***');
  for (const p of players) {
    if (p.isHuman && p.holeCards) {
      lines.push(`Dealt to ${p.name} [${formatCards(p.holeCards)}]`);
    }
  }

  // ── Segment game actions into streets ──
  // We detect street boundaries by tracking the running total each player has invested.
  // When the engine moves to a new street, it collects bets (resets currentBet to 0).
  // In the action log, this manifests as: on the new street, a player's action amount
  // represents a fresh bet from 0, not an addition to a prior street's bet.
  //
  // The reliable way: the engine records actions in sequential order.
  // Between streets, bets are collected. So the first action on a new postflop street
  // will be a 'check' or a 'bet' (never a 'call' or 'raise' as the first action of a street).
  // And it comes after the last action of the previous street was a 'call', 'check', or 'fold'
  // that completed the round.
  //
  // Simplest approach: since we KNOW how many community cards were dealt, we know which
  // streets happened. We need to figure out where in the action array each street begins.
  //
  // Strategy: walk actions, tracking running bet. When we detect the round is complete
  // (all active players have matched), the next action starts a new street.

  const streets = segmentActionsByStreet(gameActions, blinds, players);

  // Preflop actions
  for (const line of streets.preflop) {
    lines.push(line);
  }

  // Flop
  if (community.length >= 3) {
    lines.push(`*** FLOP *** [${formatCards(community.slice(0, 3))}]`);
    for (const line of streets.flop) {
      lines.push(line);
    }
  }

  // Turn
  if (community.length >= 4) {
    lines.push(`*** TURN *** [${formatCards(community.slice(0, 3))}] [${cardToString(community[3])}]`);
    for (const line of streets.turn) {
      lines.push(line);
    }
  }

  // River
  if (community.length >= 5) {
    lines.push(`*** RIVER *** [${formatCards(community.slice(0, 4))}] [${cardToString(community[4])}]`);
    for (const line of streets.river) {
      lines.push(line);
    }
  }

  // ── Uncalled bet / pot collection ──
  // Find last aggressive action
  const lastAggro = findLastUnmatchedBet(gameActions, blinds, players);
  if (lastAggro) {
    lines.push(`Uncalled bet (${dollars(lastAggro.uncalled)}) returned to ${players[lastAggro.seat].name}`);
  }

  // Pot collected — find winners from the final state
  const totalPot = handState.pot;
  // The winners are the players who gained chips
  for (const p of players) {
    if (p.stack > STARTING_STACK_CENTS) {
      const won = p.stack - STARTING_STACK_CENTS;
      // Add back what they invested to get actual pot won
      lines.push(`${p.name} collected ${dollars(totalPot)} from pot`);
      break; // Simple case — one winner. Multi-winner handled by side pots.
    }
  }

  // If no one gained (e.g., everyone folded to BB who just gets blinds back minus their own)
  // Check by looking at who is still active
  const activePlayers = players.filter(p => p.isActive);
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    if (!lines.some(l => l.includes('collected'))) {
      lines.push(`${winner.name} collected ${dollars(totalPot)} from pot`);
    }
  }

  // ── Showdown ──
  if (community.length === 5 && activePlayers.length > 1) {
    lines.push('*** SHOW DOWN ***');
    for (const p of activePlayers) {
      if (p.holeCards) {
        lines.push(`${p.name}: shows [${formatCards(p.holeCards)}]`);
      }
    }
  }

  // ── Summary ──
  lines.push('*** SUMMARY ***');
  lines.push(`Total pot ${dollars(totalPot)} | Rake $0.00`);
  if (community.length > 0) {
    lines.push(`Board [${formatCards(community)}]`);
  }

  // Seat summary
  for (const p of players) {
    const seatNum = p.seatIndex + 1;
    const posLabel = getSeatLabel(p.seatIndex, btnSeat, players.length);
    const prefix = `Seat ${seatNum}: ${p.name}${posLabel}`;

    if (!p.isActive) {
      // Folded — determine when
      const foldStreet = getFoldStreet(p.seatIndex, gameActions, blinds);
      lines.push(`${prefix} folded ${foldStreet}`);
    } else if (p.stack > STARTING_STACK_CENTS) {
      lines.push(`${prefix} collected (${dollars(totalPot)})`);
    } else if (p.stack === STARTING_STACK_CENTS && activePlayers.length === 1 && activePlayers[0].seatIndex === p.seatIndex) {
      lines.push(`${prefix} collected (${dollars(totalPot)})`);
    } else {
      lines.push(`${prefix} lost`);
    }
  }

  // Two blank lines after each hand
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

// ── Helper functions ──

interface StreetActions {
  preflop: string[];
  flop: string[];
  turn: string[];
  river: string[];
}

function segmentActionsByStreet(
  gameActions: Action[],
  blinds: Action[],
  players: Player[]
): StreetActions {
  const result: StreetActions = { preflop: [], flop: [], turn: [], river: [] };
  const streetOrder: (keyof StreetActions)[] = ['preflop', 'flop', 'turn', 'river'];
  let streetIdx = 0;

  // Track per-street bet amounts
  let currentBet = 0;
  const playerStreetBets = new Map<number, number>();

  // Initialize preflop with blind amounts
  for (const a of blinds) {
    playerStreetBets.set(a.playerSeatIndex, a.amount);
    if (a.amount > currentBet) currentBet = a.amount;
  }

  // Track active (not folded) players
  const folded = new Set<number>();
  const allIn = new Set<number>();

  // Count how many players need to act
  let actedThisStreet = new Set<number>();
  let actionsSinceLastRaise = 0;

  for (const a of gameActions) {
    const street = streetOrder[streetIdx];
    const name = players[a.playerSeatIndex].name;
    const playerBet = playerStreetBets.get(a.playerSeatIndex) ?? 0;

    // Detect street transition: if this is a 'check' or 'bet' and it seems like
    // we've moved to a new street (all remaining players matched on previous street)
    if (streetIdx < 3 && actedThisStreet.size > 0) {
      const activePlayers = players.filter(p => !folded.has(p.seatIndex) && !allIn.has(p.seatIndex));
      const allMatched = activePlayers.every(
        p => actedThisStreet.has(p.seatIndex) && (playerStreetBets.get(p.seatIndex) ?? 0) >= currentBet
      );

      if (allMatched && (a.type === 'check' || a.type === 'bet')) {
        // New street
        streetIdx++;
        currentBet = 0;
        playerStreetBets.clear();
        actedThisStreet = new Set();
      }
    }

    const currentStreet = streetOrder[streetIdx] ?? 'river';

    // Format the action
    let line = '';
    switch (a.type) {
      case 'fold':
        line = `${name}: folds`;
        folded.add(a.playerSeatIndex);
        break;
      case 'check':
        line = `${name}: checks`;
        break;
      case 'call': {
        const callAmount = currentBet - playerBet;
        line = `${name}: calls ${dollars(callAmount)}`;
        playerStreetBets.set(a.playerSeatIndex, currentBet);
        break;
      }
      case 'bet':
        line = `${name}: bets ${dollars(a.amount)}`;
        playerStreetBets.set(a.playerSeatIndex, a.amount);
        currentBet = a.amount;
        actedThisStreet = new Set(); // Others need to respond
        break;
      case 'raise': {
        const prevBet = playerBet;
        const totalNow = prevBet + a.amount;
        const raiseIncrement = a.amount;
        line = `${name}: raises ${dollars(raiseIncrement)} to ${dollars(totalNow)}`;
        playerStreetBets.set(a.playerSeatIndex, totalNow);
        currentBet = totalNow;
        actedThisStreet = new Set(); // Others need to respond
        break;
      }
    }

    actedThisStreet.add(a.playerSeatIndex);
    result[currentStreet].push(line);
  }

  return result;
}

function findLastUnmatchedBet(
  gameActions: Action[],
  blinds: Action[],
  players: Player[]
): { seat: number; uncalled: number } | null {
  // Walk actions in reverse to find the last bet/raise that wasn't called
  for (let i = gameActions.length - 1; i >= 0; i--) {
    const a = gameActions[i];
    if (a.type === 'bet' || a.type === 'raise') {
      // Check if anyone called after this
      const calledBy = gameActions.slice(i + 1).some(
        next => next.type === 'call' && next.playerSeatIndex !== a.playerSeatIndex
      );
      if (!calledBy) {
        return { seat: a.playerSeatIndex, uncalled: a.amount };
      }
      return null;
    }
  }
  return null;
}

function getSeatLabel(seatIndex: number, btnSeat: number, totalPlayers: number): string {
  const offset = (seatIndex - btnSeat + totalPlayers) % totalPlayers;
  switch (offset) {
    case 0: return ' (button)';
    case 1: return ' (small blind)';
    case 2: return ' (big blind)';
    default: return '';
  }
}

function getFoldStreet(seatIndex: number, gameActions: Action[], blinds: Action[]): string {
  // Find the fold action and determine which street it was on
  // Simple approach: count how many street transitions happened before this fold
  let streetIdx = 0;
  const folded = new Set<number>();
  const allIn = new Set<number>();
  let currentBet = 0;
  const playerBets = new Map<number, number>();

  for (const a of blinds) {
    playerBets.set(a.playerSeatIndex, a.amount);
    if (a.amount > currentBet) currentBet = a.amount;
  }

  let actedThisStreet = new Set<number>();

  for (const a of gameActions) {
    if (a.playerSeatIndex === seatIndex && a.type === 'fold') {
      const streets = ['before Flop', 'on the Flop', 'on the Turn', 'on the River'];
      return streets[streetIdx] ?? 'before Flop';
    }

    // Basic street tracking (simplified)
    if (a.type === 'fold') {
      folded.add(a.playerSeatIndex);
    }
    actedThisStreet.add(a.playerSeatIndex);

    if (a.type === 'bet' || a.type === 'raise') {
      actedThisStreet = new Set();
      actedThisStreet.add(a.playerSeatIndex);
    }
  }

  return 'before Flop';
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCards(cards: Card[] | [Card, Card]): string {
  return cards.map(c => cardToString(c)).join(' ');
}

function formatDateET(date: Date): string {
  // Format: YYYY/MM/DD HH:MM:SS
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}/${mo}/${d} ${h}:${mi}:${s}`;
}
