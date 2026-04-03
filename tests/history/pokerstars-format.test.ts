import { describe, it, expect } from 'vitest';
import { formatHand } from '../../src/main/history/pokerstars-format';
import type { HandState, Player, Action, Card } from '../../src/shared/types';
import { STARTING_STACK_CENTS, SB_CENTS, BB_CENTS } from '../../src/shared/constants';

function makePlayer(seatIndex: number, name: string, isHuman: boolean, holeCards: [Card, Card] | null, isActive = true): Player {
  return {
    seatIndex, name, stack: STARTING_STACK_CENTS,
    holeCards, isHuman, isActive, isSittingOut: false,
    currentBet: 0, hasActed: false,
    position: (['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'] as const)[seatIndex]
  };
}

function c(s: string): Card {
  return { rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] };
}

describe('formatHand — PokerStars format', () => {
  it('formats a simple hand where everyone folds to a raise', () => {
    const players: Player[] = [
      makePlayer(0, 'Hero', true, [c('Ah'), c('Kd')], true),
      makePlayer(1, 'Bot1', false, [c('7c'), c('2s')], false),
      makePlayer(2, 'Bot2', false, [c('3d'), c('4h')], false),
      makePlayer(3, 'Bot3', false, [c('9s'), c('Tc')], false),
      makePlayer(4, 'Bot4', false, [c('Jh'), c('Qc')], false),
      makePlayer(5, 'Bot5', false, [c('5d'), c('6s')], false),
    ];

    // Mark everyone except Hero as folded
    for (let i = 1; i < 6; i++) players[i].isActive = false;

    const actions: Action[] = [
      { playerSeatIndex: 1, type: 'post_sb', amount: SB_CENTS, timestamp: 0 },
      { playerSeatIndex: 2, type: 'post_bb', amount: BB_CENTS, timestamp: 0 },
      // UTG (3) folds, MP (4) folds, CO (5) folds
      { playerSeatIndex: 3, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 4, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 5, type: 'fold', amount: 0, timestamp: 0 },
      // BTN (Hero, 0) raises to 250
      { playerSeatIndex: 0, type: 'raise', amount: 250, timestamp: 0 },
      // SB (1) folds, BB (2) folds
      { playerSeatIndex: 1, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 2, type: 'fold', amount: 0, timestamp: 0 },
    ];

    const handState: HandState = {
      handId: '1',
      tableId: 'table-1',
      buttonSeatIndex: 0,
      players,
      deck: [],
      communityCards: [],
      street: 'preflop',
      pot: 150, // SB + BB
      sidePots: [],
      actions,
      currentPlayerIndex: -1,
      minRaise: 0,
      isComplete: true,
    };

    const result = formatHand(handState, 'Grind Sim I', new Date(2026, 3, 3, 12, 0, 0));

    // Check essential parts
    expect(result).toContain('PokerStars Hand #1');
    expect(result).toContain("Hold'em No Limit ($0.50/$1.00 USD)");
    expect(result).toContain("Table 'Grind Sim I' 6-max Seat #1 is the button");
    expect(result).toContain('Seat 1: Hero ($100.00 in chips)');
    expect(result).toContain('Bot1: posts small blind $0.50');
    expect(result).toContain('Bot2: posts big blind $1.00');
    expect(result).toContain('*** HOLE CARDS ***');
    expect(result).toContain('Dealt to Hero [Ah Kd]');
    expect(result).toContain('Bot3: folds');
    expect(result).toContain('Hero: raises');
    expect(result).toContain('*** SUMMARY ***');
    expect(result).toContain('Rake $0.00');
    // Should NOT have flop/turn/river sections
    expect(result).not.toContain('*** FLOP ***');
  });

  it('formats a hand that goes to the flop', () => {
    const players: Player[] = [
      makePlayer(0, 'Hero', true, [c('Ah'), c('Kd')], true),
      makePlayer(1, 'Bot1', false, [c('7c'), c('2s')], false),
      makePlayer(2, 'Bot2', false, [c('3d'), c('4h')], true),
      makePlayer(3, 'Bot3', false, [c('9s'), c('Tc')], false),
      makePlayer(4, 'Bot4', false, [c('Jh'), c('Qc')], false),
      makePlayer(5, 'Bot5', false, [c('5d'), c('6s')], false),
    ];

    const actions: Action[] = [
      { playerSeatIndex: 1, type: 'post_sb', amount: SB_CENTS, timestamp: 0 },
      { playerSeatIndex: 2, type: 'post_bb', amount: BB_CENTS, timestamp: 0 },
      { playerSeatIndex: 3, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 4, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 5, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 0, type: 'raise', amount: 250, timestamp: 0 },
      { playerSeatIndex: 1, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 2, type: 'call', amount: 150, timestamp: 0 },
      // Flop actions
      { playerSeatIndex: 2, type: 'check', amount: 0, timestamp: 0 },
      { playerSeatIndex: 0, type: 'bet', amount: 300, timestamp: 0 },
      { playerSeatIndex: 2, type: 'fold', amount: 0, timestamp: 0 },
    ];

    const handState: HandState = {
      handId: '42',
      tableId: 'table-1',
      buttonSeatIndex: 0,
      players,
      deck: [],
      communityCards: [c('Qs'), c('Td'), c('3c')],
      street: 'flop',
      pot: 550, // preflop pot
      sidePots: [],
      actions,
      currentPlayerIndex: -1,
      minRaise: 0,
      isComplete: true,
    };

    const result = formatHand(handState, 'Grind Sim II', new Date(2026, 3, 3, 14, 30, 0));

    expect(result).toContain('PokerStars Hand #42');
    expect(result).toContain("Table 'Grind Sim II'");
    expect(result).toContain('*** FLOP *** [Qs Td 3c]');
    expect(result).toContain('Bot2: checks');
    expect(result).toContain('Hero: bets $3.00');
    expect(result).toContain('Bot2: folds');
    expect(result).toContain('Board [Qs Td 3c]');
  });

  it('includes two blank lines at the end', () => {
    const players: Player[] = [
      makePlayer(0, 'Hero', true, [c('Ah'), c('Kd')], true),
      makePlayer(1, 'Bot1', false, null, false),
      makePlayer(2, 'Bot2', false, null, false),
      makePlayer(3, 'Bot3', false, null, false),
      makePlayer(4, 'Bot4', false, null, false),
      makePlayer(5, 'Bot5', false, null, false),
    ];

    const actions: Action[] = [
      { playerSeatIndex: 1, type: 'post_sb', amount: SB_CENTS, timestamp: 0 },
      { playerSeatIndex: 2, type: 'post_bb', amount: BB_CENTS, timestamp: 0 },
      { playerSeatIndex: 3, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 4, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 5, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 0, type: 'raise', amount: 250, timestamp: 0 },
      { playerSeatIndex: 1, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 2, type: 'fold', amount: 0, timestamp: 0 },
    ];

    const handState: HandState = {
      handId: '1', tableId: 'table-1', buttonSeatIndex: 0, players, deck: [],
      communityCards: [], street: 'preflop', pot: 150, sidePots: [],
      actions, currentPlayerIndex: -1, minRaise: 0, isComplete: true,
    };

    const result = formatHand(handState, 'Grind Sim I', new Date());
    expect(result).toMatch(/\n\n$/);
  });

  it('uses dollars with 2 decimal places', () => {
    const players: Player[] = [
      makePlayer(0, 'Hero', true, [c('Ah'), c('Kd')], true),
      makePlayer(1, 'Bot1', false, null, false),
      makePlayer(2, 'Bot2', false, null, false),
      makePlayer(3, 'Bot3', false, null, false),
      makePlayer(4, 'Bot4', false, null, false),
      makePlayer(5, 'Bot5', false, null, false),
    ];

    const actions: Action[] = [
      { playerSeatIndex: 1, type: 'post_sb', amount: SB_CENTS, timestamp: 0 },
      { playerSeatIndex: 2, type: 'post_bb', amount: BB_CENTS, timestamp: 0 },
      { playerSeatIndex: 3, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 4, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 5, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 0, type: 'raise', amount: 250, timestamp: 0 },
      { playerSeatIndex: 1, type: 'fold', amount: 0, timestamp: 0 },
      { playerSeatIndex: 2, type: 'fold', amount: 0, timestamp: 0 },
    ];

    const handState: HandState = {
      handId: '1', tableId: 'table-1', buttonSeatIndex: 0, players, deck: [],
      communityCards: [], street: 'preflop', pot: 150, sidePots: [],
      actions, currentPlayerIndex: -1, minRaise: 0, isComplete: true,
    };

    const result = formatHand(handState, 'Grind Sim I', new Date());
    // All dollar amounts should have exactly 2 decimal places
    const dollarMatches = result.match(/\$\d+\.\d+/g) ?? [];
    for (const m of dollarMatches) {
      const decimals = m.split('.')[1];
      expect(decimals).toHaveLength(2);
    }
  });
});
