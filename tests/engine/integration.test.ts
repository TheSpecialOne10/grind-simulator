import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/main/engine/game-engine';
import { BotController } from '../../src/main/bot/bot-controller';
import { PreflopCharts } from '../../src/main/bot/preflop-charts';
import type { GameEngineConfig } from '../../src/main/engine/types';
import type { TableSnapshot } from '../../src/shared/types';
import { STARTING_STACK_CENTS } from '../../src/shared/constants';

function makeIntegrationConfig(seed: number): GameEngineConfig {
  // Load some basic preflop ranges for testing
  const charts = new PreflopCharts();
  charts.loadScenario({
    scenario: 'rfi',
    position: 'UTG',
    vsPosition: null,
    description: 'UTG RFI',
    defaultAction: 'fold',
    ranges: {
      'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
      'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 0.8, fold: 0.2 },
      'AKs': { raise: 1.0 }, 'AKo': { raise: 1.0 }, 'AQs': { raise: 1.0 },
      'AQo': { raise: 0.7, fold: 0.3 }, 'AJs': { raise: 0.8, fold: 0.2 },
      'KQs': { raise: 0.7, fold: 0.3 }
    }
  });
  charts.loadScenario({
    scenario: 'rfi',
    position: 'CO',
    vsPosition: null,
    description: 'CO RFI',
    defaultAction: 'fold',
    ranges: {
      'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
      'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 1.0 },
      '88': { raise: 0.8, fold: 0.2 }, '77': { raise: 0.6, fold: 0.4 },
      'AKs': { raise: 1.0 }, 'AKo': { raise: 1.0 }, 'AQs': { raise: 1.0 },
      'AQo': { raise: 1.0 }, 'AJs': { raise: 1.0 }, 'ATs': { raise: 0.8, fold: 0.2 },
      'KQs': { raise: 1.0 }, 'KQo': { raise: 0.6, fold: 0.4 },
      'QJs': { raise: 0.7, fold: 0.3 }, 'JTs': { raise: 0.7, fold: 0.3 }
    }
  });
  charts.loadScenario({
    scenario: 'rfi',
    position: 'BTN',
    vsPosition: null,
    description: 'BTN RFI',
    defaultAction: 'fold',
    ranges: {
      'AA': { raise: 1.0 }, 'KK': { raise: 1.0 }, 'QQ': { raise: 1.0 },
      'JJ': { raise: 1.0 }, 'TT': { raise: 1.0 }, '99': { raise: 1.0 },
      '88': { raise: 1.0 }, '77': { raise: 0.8, fold: 0.2 }, '66': { raise: 0.6, fold: 0.4 },
      'AKs': { raise: 1.0 }, 'AKo': { raise: 1.0 }, 'AQs': { raise: 1.0 },
      'AQo': { raise: 1.0 }, 'AJs': { raise: 1.0 }, 'ATs': { raise: 1.0 },
      'A9s': { raise: 0.7, fold: 0.3 }, 'KQs': { raise: 1.0 }, 'KQo': { raise: 0.8, fold: 0.2 },
      'KJs': { raise: 1.0 }, 'QJs': { raise: 1.0 }, 'JTs': { raise: 1.0 },
      'T9s': { raise: 0.6, fold: 0.4 }, '98s': { raise: 0.5, fold: 0.5 }
    }
  });
  charts.loadScenario({
    scenario: 'vs_rfi',
    position: 'BB',
    vsPosition: 'UTG',
    description: 'BB vs UTG open',
    defaultAction: 'fold',
    ranges: {
      'AA': { raise: 0.8, call: 0.2 }, 'KK': { raise: 0.75, call: 0.25 },
      'QQ': { raise: 0.6, call: 0.4 }, 'JJ': { raise: 0.4, call: 0.6 },
      'TT': { call: 0.8, raise: 0.2 }, '99': { call: 0.6, fold: 0.4 },
      'AKs': { raise: 0.65, call: 0.35 }, 'AKo': { raise: 0.45, call: 0.3, fold: 0.25 },
      'AQs': { raise: 0.3, call: 0.5, fold: 0.2 },
    }
  });

  const botController = new BotController(charts, false); // No delay for tests

  return {
    tableId: 'integration-test',
    humanSeatIndex: 0,
    playerNames: ['Hero', 'Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5'],
    actionProvider: botController,
    onSnapshot: () => {},
    seed
  };
}

describe('Integration — Bot Controller + Game Engine', () => {
  it('runs 500 hands without crashing', async () => {
    const config = makeIntegrationConfig(42);
    const engine = new GameEngine(config);

    for (let i = 0; i < 500; i++) {
      const handState = await engine.playHand();
      expect(handState.isComplete).toBe(true);

      // Chips must be conserved
      const totalStacks = engine.getPlayers().reduce((sum, p) => sum + p.stack, 0);
      expect(totalStacks).toBe(6 * STARTING_STACK_CENTS);
    }
  });

  it('generates valid action histories', async () => {
    const config = makeIntegrationConfig(123);
    const engine = new GameEngine(config);

    for (let i = 0; i < 50; i++) {
      const handState = await engine.playHand();

      // Every hand should have at least blind posts
      expect(handState.actions.length).toBeGreaterThanOrEqual(2);

      // First two actions should be blind posts
      expect(handState.actions[0].type).toBe('post_sb');
      expect(handState.actions[1].type).toBe('post_bb');

      // All action amounts should be non-negative
      for (const action of handState.actions) {
        expect(action.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('bot raises when holding premium hands', async () => {
    // Run many hands and verify that raises occur (bots don't just always fold)
    const config = makeIntegrationConfig(999);
    const engine = new GameEngine(config);

    let raiseCount = 0;
    for (let i = 0; i < 200; i++) {
      const handState = await engine.playHand();
      raiseCount += handState.actions.filter(a => a.type === 'raise').length;
    }

    // With loaded ranges, there should be some raises
    expect(raiseCount).toBeGreaterThan(0);
  });

  it('hands reach showdown sometimes', async () => {
    const config = makeIntegrationConfig(7777);
    const engine = new GameEngine(config);

    let showdownCount = 0;
    for (let i = 0; i < 200; i++) {
      const handState = await engine.playHand();
      if (handState.communityCards.length === 5) {
        showdownCount++;
      }
    }

    // Some hands should reach showdown (players calling to river)
    expect(showdownCount).toBeGreaterThan(0);
  });

  it('button rotates correctly over many hands', async () => {
    const config = makeIntegrationConfig(42);
    const engine = new GameEngine(config);

    const buttons: number[] = [];
    for (let i = 0; i < 12; i++) {
      await engine.playHand();
      buttons.push(engine.getButtonSeatIndex());
    }

    // Button should cycle through all 6 seats twice
    for (let i = 1; i < buttons.length; i++) {
      expect(buttons[i]).toBe((buttons[i - 1] + 1) % 6);
    }
  });
});
