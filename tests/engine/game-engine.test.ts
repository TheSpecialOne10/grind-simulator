import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/main/engine/game-engine';
import type { GameEngineConfig, ActionProvider } from '../../src/main/engine/types';
import type { HandState, TableSnapshot } from '../../src/shared/types';
import { STARTING_STACK_CENTS, BB_CENTS, SB_CENTS } from '../../src/shared/constants';

/** Action provider that always folds. */
const alwaysFoldProvider: ActionProvider = {
  async getAction(_handState, _seatIndex, validActions) {
    const fold = validActions.find(a => a.type === 'fold');
    if (fold) return { type: 'fold', amount: 0 };
    const check = validActions.find(a => a.type === 'check');
    if (check) return { type: 'check', amount: 0 };
    return { type: 'fold', amount: 0 };
  }
};

/** Action provider that always calls/checks (raises minimum when call is unavailable). */
const alwaysCallProvider: ActionProvider = {
  async getAction(_handState, _seatIndex, validActions) {
    const call = validActions.find(a => a.type === 'call');
    if (call) return { type: 'call', amount: call.minAmount };
    const check = validActions.find(a => a.type === 'check');
    if (check) return { type: 'check', amount: 0 };
    // No call or check available (limping eliminated preflop) — raise minimum
    const raise = validActions.find(a => a.type === 'raise');
    if (raise) return { type: 'raise', amount: raise.minAmount };
    const bet = validActions.find(a => a.type === 'bet');
    if (bet) return { type: 'bet', amount: bet.minAmount };
    return { type: 'fold', amount: 0 };
  }
};

function makeConfig(
  overrides: Partial<GameEngineConfig> = {}
): GameEngineConfig {
  const snapshots: TableSnapshot[] = [];
  return {
    tableId: 'test-table',
    humanSeatIndex: 0,
    playerNames: ['Hero', 'Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5'],
    actionProvider: alwaysFoldProvider,
    onSnapshot: (_tableId, snapshot) => { snapshots.push(snapshot); },
    seed: 42,
    ...overrides,
    // Store snapshots reference on config for test access
  } as GameEngineConfig & { _snapshots?: TableSnapshot[] };
}

describe('GameEngine — single hand basics', () => {
  it('plays a hand where everyone folds to BB', async () => {
    const snapshots: TableSnapshot[] = [];
    const config = makeConfig({
      actionProvider: alwaysFoldProvider,
      onSnapshot: (_, s) => snapshots.push(s)
    });
    const engine = new GameEngine(config);
    const handState = await engine.playHand();

    // Hand should be complete
    expect(handState.isComplete).toBe(true);

    // One player should have won the blinds
    const players = engine.getPlayers();
    const totalStacks = players.reduce((sum, p) => sum + p.stack, 0);
    // Total chips should be conserved (6 * 10000 = 60000)
    expect(totalStacks).toBe(6 * STARTING_STACK_CENTS);
  });

  it('plays a hand where everyone calls and goes to showdown', async () => {
    const snapshots: TableSnapshot[] = [];
    const config = makeConfig({
      actionProvider: alwaysCallProvider,
      onSnapshot: (_, s) => snapshots.push(s)
    });
    const engine = new GameEngine(config);
    const handState = await engine.playHand();

    expect(handState.isComplete).toBe(true);
    expect(handState.communityCards).toHaveLength(5);

    // Total chips conserved
    const players = engine.getPlayers();
    const totalStacks = players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalStacks).toBe(6 * STARTING_STACK_CENTS);

    // Winner info should be present in final snapshot
    const lastSnapshot = snapshots[snapshots.length - 1];
    expect(lastSnapshot.isHandComplete).toBe(true);
    expect(lastSnapshot.winnerInfo).not.toBeNull();
    expect(lastSnapshot.winnerInfo!.length).toBeGreaterThan(0);
  });

  it('button rotates between hands', async () => {
    const config = makeConfig();
    const engine = new GameEngine(config);

    await engine.playHand();
    const btn1 = engine.getButtonSeatIndex();

    await engine.playHand();
    const btn2 = engine.getButtonSeatIndex();

    expect(btn2).toBe((btn1 + 1) % 6);
  });

  it('assigns correct positions relative to button', async () => {
    const config = makeConfig();
    const engine = new GameEngine(config);
    await engine.playHand();

    const players = engine.getPlayers();
    const btn = engine.getButtonSeatIndex();

    const btnPlayer = players.find(p => p.seatIndex === btn);
    expect(btnPlayer?.position).toBe('BTN');

    const sbPlayer = players.find(p => p.seatIndex === (btn + 1) % 6);
    expect(sbPlayer?.position).toBe('SB');

    const bbPlayer = players.find(p => p.seatIndex === (btn + 2) % 6);
    expect(bbPlayer?.position).toBe('BB');
  });

  it('hand counter increments', async () => {
    const config = makeConfig();
    const engine = new GameEngine(config);

    await engine.playHand();
    expect(engine.getHandCounter()).toBe(1);

    await engine.playHand();
    expect(engine.getHandCounter()).toBe(2);
  });
});

describe('GameEngine — chip conservation', () => {
  it('conserves chips over 50 hands with all-fold action', async () => {
    const config = makeConfig({ actionProvider: alwaysFoldProvider });
    const engine = new GameEngine(config);

    for (let i = 0; i < 50; i++) {
      await engine.playHand();
      const total = engine.getPlayers().reduce((sum, p) => sum + p.stack, 0);
      expect(total).toBe(6 * STARTING_STACK_CENTS);
    }
  });

  it('conserves chips over 50 hands with all-call action (showdown)', async () => {
    const config = makeConfig({ actionProvider: alwaysCallProvider });
    const engine = new GameEngine(config);

    for (let i = 0; i < 50; i++) {
      await engine.playHand();
      const total = engine.getPlayers().reduce((sum, p) => sum + p.stack, 0);
      expect(total).toBe(6 * STARTING_STACK_CENTS);
    }
  });
});

describe('GameEngine — seeded determinism', () => {
  it('produces identical hands with same seed', async () => {
    const snapshots1: TableSnapshot[] = [];
    const snapshots2: TableSnapshot[] = [];

    const config1 = makeConfig({
      actionProvider: alwaysCallProvider,
      onSnapshot: (_, s) => snapshots1.push(s),
      seed: 123
    });
    const config2 = makeConfig({
      actionProvider: alwaysCallProvider,
      onSnapshot: (_, s) => snapshots2.push(s),
      seed: 123
    });

    const engine1 = new GameEngine(config1);
    const engine2 = new GameEngine(config2);

    const hand1 = await engine1.playHand();
    const hand2 = await engine2.playHand();

    // Community cards should match
    expect(hand1.communityCards).toEqual(hand2.communityCards);
  });
});

describe('GameEngine — custom action provider', () => {
  it('handles a raise and call scenario', async () => {
    let actionCount = 0;
    const raiseCallProvider: ActionProvider = {
      async getAction(handState, seatIndex, validActions) {
        actionCount++;
        // First non-blind actor raises; everyone else calls or folds
        if (actionCount === 1) {
          const raise = validActions.find(a => a.type === 'raise');
          if (raise) return { type: 'raise', amount: 250 }; // 2.5bb
        }
        const call = validActions.find(a => a.type === 'call');
        if (call) return { type: 'call', amount: call.minAmount };
        const check = validActions.find(a => a.type === 'check');
        if (check) return { type: 'check', amount: 0 };
        return { type: 'fold', amount: 0 };
      }
    };

    const config = makeConfig({ actionProvider: raiseCallProvider });
    const engine = new GameEngine(config);
    const handState = await engine.playHand();

    expect(handState.isComplete).toBe(true);
    // Should have a raise action recorded
    const raiseAction = handState.actions.find(a => a.type === 'raise');
    expect(raiseAction).toBeDefined();

    // Chips conserved
    const total = engine.getPlayers().reduce((sum, p) => sum + p.stack, 0);
    expect(total).toBe(6 * STARTING_STACK_CENTS);
  });
});
