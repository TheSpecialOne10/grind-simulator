import { describe, it, expect } from 'vitest';
import { PotManager } from '../../src/main/engine/pot-manager';

describe('PotManager', () => {
  it('tracks simple pot with equal bets', () => {
    const pm = new PotManager();
    pm.addBet(0, 100);
    pm.addBet(1, 100);
    pm.addBet(2, 100);

    expect(pm.getTotalPot()).toBe(300);

    const pots = pm.calculatePots();
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayers).toEqual([0, 1, 2]);
  });

  it('creates side pot when one player is all-in for less', () => {
    const pm = new PotManager();
    pm.addBet(0, 50);   // Player A all-in for 50
    pm.addBet(1, 100);  // Player B bets 100
    pm.addBet(2, 100);  // Player C bets 100

    const pots = pm.calculatePots();
    expect(pots).toHaveLength(2);

    // Main pot: 50 * 3 = 150, all eligible
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligiblePlayers).toEqual([0, 1, 2]);

    // Side pot: 50 * 2 = 100, only B and C
    expect(pots[1].amount).toBe(100);
    expect(pots[1].eligiblePlayers).toEqual([1, 2]);
  });

  it('creates multiple side pots with different all-in amounts', () => {
    const pm = new PotManager();
    pm.addBet(0, 30);   // 30
    pm.addBet(1, 60);   // 60
    pm.addBet(2, 100);  // 100
    pm.addBet(3, 100);  // 100

    const pots = pm.calculatePots();
    expect(pots).toHaveLength(3);

    // Main: 30 * 4 = 120
    expect(pots[0].amount).toBe(120);
    expect(pots[0].eligiblePlayers).toEqual([0, 1, 2, 3]);

    // Side 1: 30 * 3 = 90 (players 1, 2, 3 each contributed 30 more)
    expect(pots[1].amount).toBe(90);
    expect(pots[1].eligiblePlayers).toEqual([1, 2, 3]);

    // Side 2: 40 * 2 = 80 (players 2, 3 each contributed 40 more)
    expect(pots[2].amount).toBe(80);
    expect(pots[2].eligiblePlayers).toEqual([2, 3]);

    // Total should match
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(290);
  });

  it('excludes folded players from pot eligibility', () => {
    const pm = new PotManager();
    pm.addBet(0, 100);
    pm.addBet(1, 100);
    pm.addBet(2, 50);
    pm.markFolded(2);

    const pots = pm.calculatePots();
    // All money still in pot, but player 2 not eligible
    expect(pm.getTotalPot()).toBe(250);

    // Main pot: 50 * 3 = 150, only 0 and 1 eligible
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligiblePlayers).toEqual([0, 1]);

    // Side pot: 50 * 2 = 100, only 0 and 1
    expect(pots[1].amount).toBe(100);
    expect(pots[1].eligiblePlayers).toEqual([0, 1]);
  });

  it('handles heads-up pot', () => {
    const pm = new PotManager();
    pm.addBet(0, 200);
    pm.addBet(1, 200);

    const pots = pm.calculatePots();
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(400);
  });

  it('resets correctly', () => {
    const pm = new PotManager();
    pm.addBet(0, 100);
    pm.addBet(1, 100);
    pm.reset();

    expect(pm.getTotalPot()).toBe(0);
    expect(pm.calculatePots()).toHaveLength(0);
  });
});

describe('PotManager.awardPots', () => {
  it('awards single pot to single winner', () => {
    const pots = [{ amount: 300, eligiblePlayers: [0, 1, 2] }];
    const awards = PotManager.awardPots(pots, [[0]]);
    expect(awards.get(0)).toBe(300);
  });

  it('splits pot evenly between two winners', () => {
    const pots = [{ amount: 300, eligiblePlayers: [0, 1] }];
    const awards = PotManager.awardPots(pots, [[0, 1]]);
    expect(awards.get(0)).toBe(150);
    expect(awards.get(1)).toBe(150);
  });

  it('gives odd chip to first winner (earliest position)', () => {
    const pots = [{ amount: 301, eligiblePlayers: [0, 1] }];
    const awards = PotManager.awardPots(pots, [[0, 1]]);
    expect(awards.get(0)).toBe(151); // Odd chip
    expect(awards.get(1)).toBe(150);
  });

  it('awards multiple pots to different winners', () => {
    const pots = [
      { amount: 150, eligiblePlayers: [0, 1, 2] },
      { amount: 100, eligiblePlayers: [1, 2] }
    ];
    // Player 0 wins main pot, player 2 wins side pot
    const awards = PotManager.awardPots(pots, [[0], [2]]);
    expect(awards.get(0)).toBe(150);
    expect(awards.get(2)).toBe(100);
    expect(awards.has(1)).toBe(false);
  });

  it('handles three-way split with odd chips', () => {
    const pots = [{ amount: 100, eligiblePlayers: [0, 1, 2] }];
    const awards = PotManager.awardPots(pots, [[0, 1, 2]]);
    // 100 / 3 = 33 each, 1 remainder to first
    expect(awards.get(0)).toBe(34);
    expect(awards.get(1)).toBe(33);
    expect(awards.get(2)).toBe(33);
  });
});
