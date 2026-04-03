import { describe, it, expect } from 'vitest';
import { BettingRound } from '../../src/main/engine/betting-round';
import type { Player } from '../../src/shared/types';
import { BB_CENTS, SB_CENTS } from '../../src/shared/constants';

function makePlayers(count: number, stacks?: number[]): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    seatIndex: i,
    name: `Player${i}`,
    stack: stacks ? stacks[i] : 10000,
    holeCards: null,
    isHuman: i === 0,
    isActive: true,
    isSittingOut: false,
    currentBet: 0,
    hasActed: false,
    position: (['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'] as const)[i % 6]
  }));
}

describe('BettingRound — Preflop', () => {
  it('everyone folds to BB — BB wins', () => {
    // 6 players, button at seat 0. SB=1, BB=2, UTG=3
    const players = makePlayers(6);
    const br = new BettingRound(players, true, 0);
    br.postBlinds(1, 2, SB_CENTS, BB_CENTS, players);

    // UTG (3) folds
    expect(br.getNextActor(players)).toBe(3);
    br.applyAction(3, 'fold', 0, 10000);

    // MP (4) folds
    expect(br.getNextActor(players)).toBe(4);
    br.applyAction(4, 'fold', 0, 10000);

    // CO (5) folds
    expect(br.getNextActor(players)).toBe(5);
    br.applyAction(5, 'fold', 0, 10000);

    // BTN (0) folds
    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'fold', 0, 10000);

    // SB (1) folds
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'fold', 0, 10000);

    // Round complete, only BB remains
    expect(br.isRoundComplete()).toBe(true);
    expect(br.getActivePlayerCount()).toBe(1);
  });

  it('UTG raises, everyone folds except BB who calls', () => {
    const players = makePlayers(6);
    const br = new BettingRound(players, true, 0);
    br.postBlinds(1, 2, SB_CENTS, BB_CENTS, players);

    // UTG raises to 250 (2.5bb)
    expect(br.getNextActor(players)).toBe(3);
    br.applyAction(3, 'raise', 250, 10000);

    // MP folds
    br.applyAction(4, 'fold', 0, 10000);
    // CO folds
    br.applyAction(5, 'fold', 0, 10000);
    // BTN folds
    br.applyAction(0, 'fold', 0, 10000);
    // SB folds
    br.applyAction(1, 'fold', 0, 9950); // SB has 9950 left after posting

    // BB calls
    expect(br.getNextActor(players)).toBe(2);
    const callCost = br.applyAction(2, 'call', 0, 9900); // BB has 9900 left
    expect(callCost).toBe(150); // 250 - 100(BB) = 150

    expect(br.isRoundComplete()).toBe(true);
  });

  it('raise and re-raise with correct min raise', () => {
    const players = makePlayers(3); // BTN=0, SB=1, BB=2
    const br = new BettingRound(players, true, 0);
    br.postBlinds(1, 2, SB_CENTS, BB_CENTS, players);

    // Preflop 3-handed: action starts at BTN (seat 0)
    // BTN raises to 300 (raise of 200 over BB)
    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'raise', 300, 10000);
    expect(br.getMinRaiseTo()).toBe(500); // 300 + 200 = 500

    // SB 3-bets to 900 (raise of 600 over 300)
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'raise', 900, 9950);
    expect(br.getMinRaiseTo()).toBe(1500); // 900 + 600 = 1500

    // BB folds
    expect(br.getNextActor(players)).toBe(2);
    br.applyAction(2, 'fold', 0, 9900);

    // BTN calls 900
    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'call', 0, 9700);

    expect(br.isRoundComplete()).toBe(true);
  });

  it('BB option: limped to BB, BB checks — round complete', () => {
    const players = makePlayers(3);
    const br = new BettingRound(players, true, 0);
    br.postBlinds(1, 2, SB_CENTS, BB_CENTS, players);

    // BTN calls (limp)
    br.applyAction(0, 'call', 0, 10000);
    // SB calls
    br.applyAction(1, 'call', 0, 9950);

    // BB checks (option)
    expect(br.getNextActor(players)).toBe(2);
    br.applyAction(2, 'check', 0, 9900);

    expect(br.isRoundComplete()).toBe(true);
  });

  it('BB option: limped to BB, BB raises — others must respond', () => {
    const players = makePlayers(3);
    const br = new BettingRound(players, true, 0);
    br.postBlinds(1, 2, SB_CENTS, BB_CENTS, players);

    // BTN calls (limp)
    br.applyAction(0, 'call', 0, 10000);
    // SB calls
    br.applyAction(1, 'call', 0, 9950);

    // BB raises to 400
    expect(br.getNextActor(players)).toBe(2);
    br.applyAction(2, 'raise', 400, 9900);

    // Round not complete — BTN and SB need to respond
    expect(br.isRoundComplete()).toBe(false);

    // BTN folds
    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'fold', 0, 9900);

    // SB folds
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'fold', 0, 9900);

    expect(br.isRoundComplete()).toBe(true);
  });
});

describe('BettingRound — Short all-in', () => {
  it('short all-in does NOT reopen action', () => {
    // Player 0 has only 150 chips, others have 10000
    const players = makePlayers(3, [150, 10000, 10000]);
    const br = new BettingRound(players, true, 2); // BTN=2, SB=0, BB=1

    br.postBlinds(0, 1, SB_CENTS, BB_CENTS, players);
    // SB posted 50, BB posted 100

    // BTN raises to 300
    expect(br.getNextActor(players)).toBe(2);
    br.applyAction(2, 'raise', 300, 10000);

    // SB all-in for 150 total (only 100 more, since posted 50)
    // This is a short all-in (raise increment of 150-300 = not enough)
    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'raise', 150, 100); // Player has 100 left after SB post
    // This raise is short — should NOT reopen action to BTN

    // BB calls
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'call', 0, 9900);

    // Round should be complete — BTN already acted and short all-in didn't reopen
    expect(br.isRoundComplete()).toBe(true);
  });
});

describe('BettingRound — Postflop', () => {
  it('check-check heads up', () => {
    const players = makePlayers(2); // seats 0, 1; BTN=0
    const br = new BettingRound(players, false, 0);
    br.initPostflop();

    // Postflop: SB (seat 1) acts first (first after BTN)
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'check', 0, 10000);

    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'check', 0, 10000);

    expect(br.isRoundComplete()).toBe(true);
  });

  it('bet and call', () => {
    const players = makePlayers(2);
    const br = new BettingRound(players, false, 0);
    br.initPostflop();

    // Seat 1 bets 200
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'bet', 200, 10000);

    // Seat 0 calls
    expect(br.getNextActor(players)).toBe(0);
    const cost = br.applyAction(0, 'call', 0, 10000);
    expect(cost).toBe(200);

    expect(br.isRoundComplete()).toBe(true);
  });

  it('check-raise', () => {
    const players = makePlayers(2);
    const br = new BettingRound(players, false, 0);
    br.initPostflop();

    // Seat 1 checks
    br.applyAction(1, 'check', 0, 10000);

    // Seat 0 bets 300
    br.applyAction(0, 'bet', 300, 10000);

    // Seat 1 raises to 900
    expect(br.getNextActor(players)).toBe(1);
    br.applyAction(1, 'raise', 900, 10000);

    // Seat 0 must respond
    expect(br.isRoundComplete()).toBe(false);
    expect(br.getNextActor(players)).toBe(0);
    br.applyAction(0, 'call', 0, 9700);

    expect(br.isRoundComplete()).toBe(true);
  });

  it('bet and fold', () => {
    const players = makePlayers(3);
    const br = new BettingRound(players, false, 0);
    br.initPostflop();

    // Post-flop 3-handed, BTN=0: action starts at seat 1
    br.applyAction(1, 'bet', 500, 10000);
    br.applyAction(2, 'fold', 0, 10000);
    br.applyAction(0, 'fold', 0, 10000);

    expect(br.isRoundComplete()).toBe(true);
    expect(br.getActivePlayerCount()).toBe(1);
  });
});

describe('BettingRound — getValidActions', () => {
  it('returns fold/call/raise when facing a bet', () => {
    const players = makePlayers(2);
    const br = new BettingRound(players, false, 0);
    br.initPostflop();

    // Seat 1 bets 200
    br.applyAction(1, 'bet', 200, 10000);

    const actions = br.getValidActions(0, 10000);
    const types = actions.map(a => a.type);
    expect(types).toContain('fold');
    expect(types).toContain('call');
    expect(types).toContain('raise');
  });

  it('returns check/bet when no outstanding bet', () => {
    const players = makePlayers(2);
    const br = new BettingRound(players, false, 0);
    br.initPostflop();

    const actions = br.getValidActions(1, 10000);
    const types = actions.map(a => a.type);
    expect(types).toContain('check');
    expect(types).toContain('bet');
    expect(types).not.toContain('fold');
  });
});
