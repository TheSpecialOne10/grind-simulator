import { describe, it, expect } from 'vitest';
import { PreflopCharts } from '../../src/main/bot/preflop-charts';
import type { Card } from '../../src/shared/types';

function c(s: string): Card {
  return { rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] };
}

describe('PreflopCharts.getCanonicalHand', () => {
  it('pocket pair', () => {
    expect(PreflopCharts.getCanonicalHand(c('Ah'), c('Ad'))).toBe('AA');
    expect(PreflopCharts.getCanonicalHand(c('2c'), c('2s'))).toBe('22');
  });

  it('suited hands — higher rank first', () => {
    expect(PreflopCharts.getCanonicalHand(c('Ah'), c('Kh'))).toBe('AKs');
    expect(PreflopCharts.getCanonicalHand(c('Kh'), c('Ah'))).toBe('AKs'); // reversed input
    expect(PreflopCharts.getCanonicalHand(c('Qs'), c('Js'))).toBe('QJs');
  });

  it('offsuit hands — higher rank first', () => {
    expect(PreflopCharts.getCanonicalHand(c('Ah'), c('Kd'))).toBe('AKo');
    expect(PreflopCharts.getCanonicalHand(c('Kd'), c('Ah'))).toBe('AKo');
    expect(PreflopCharts.getCanonicalHand(c('Tc'), c('9h'))).toBe('T9o');
  });
});

describe('PreflopCharts.classifyScenario', () => {
  it('first to act with no prior action = rfi', () => {
    const result = PreflopCharts.classifyScenario([], 'UTG');
    expect(result).toEqual({ scenario: 'rfi', position: 'UTG', vsPosition: null });
  });

  it('facing a single raise = vs_rfi', () => {
    const actions = [{ type: 'raise', playerPosition: 'UTG' }];
    const result = PreflopCharts.classifyScenario(actions, 'BB');
    expect(result).toEqual({ scenario: 'vs_rfi', position: 'BB', vsPosition: 'UTG' });
  });

  it('facing a 3-bet after opening = vs_3bet', () => {
    const actions = [
      { type: 'raise', playerPosition: 'UTG' },
      { type: 'raise', playerPosition: 'BB' }
    ];
    const result = PreflopCharts.classifyScenario(actions, 'UTG');
    expect(result).toEqual({ scenario: 'vs_3bet', position: 'UTG', vsPosition: 'BB' });
  });

  it('facing a 4-bet after 3-betting = vs_4bet', () => {
    const actions = [
      { type: 'raise', playerPosition: 'CO' },
      { type: 'raise', playerPosition: 'BB' },
      { type: 'raise', playerPosition: 'CO' }
    ];
    const result = PreflopCharts.classifyScenario(actions, 'BB');
    expect(result).toEqual({ scenario: 'vs_4bet', position: 'BB', vsPosition: 'CO' });
  });

  it('limp pot', () => {
    const actions = [{ type: 'call', playerPosition: 'UTG' }];
    const result = PreflopCharts.classifyScenario(actions, 'MP');
    expect(result).toEqual({ scenario: 'limp', position: 'MP', vsPosition: null });
  });

  it('ignores blind posts', () => {
    const actions = [
      { type: 'post_sb', playerPosition: 'SB' },
      { type: 'post_bb', playerPosition: 'BB' }
    ];
    const result = PreflopCharts.classifyScenario(actions, 'UTG');
    expect(result).toEqual({ scenario: 'rfi', position: 'UTG', vsPosition: null });
  });
});

describe('PreflopCharts — loading and lookup', () => {
  it('loads a scenario and looks up frequencies', () => {
    const charts = new PreflopCharts();
    charts.loadScenario({
      scenario: 'rfi',
      position: 'UTG',
      vsPosition: null,
      description: 'UTG RFI',
      defaultAction: 'fold',
      ranges: {
        'AA': { raise: 1.0 },
        'AKs': { raise: 1.0 },
        'AKo': { raise: 0.85, fold: 0.15 },
        '72o': { fold: 1.0 }
      }
    });

    expect(charts.isLoaded()).toBe(true);

    const aa = charts.getFrequencies('rfi', 'UTG', null, 'AA');
    expect(aa).toEqual({ raise: 1.0 });

    const ako = charts.getFrequencies('rfi', 'UTG', null, 'AKo');
    expect(ako).toEqual({ raise: 0.85, fold: 0.15 });
  });

  it('returns default action for unlisted hands', () => {
    const charts = new PreflopCharts();
    charts.loadScenario({
      scenario: 'rfi',
      position: 'UTG',
      vsPosition: null,
      description: 'UTG RFI',
      defaultAction: 'fold',
      ranges: { 'AA': { raise: 1.0 } }
    });

    const unknown = charts.getFrequencies('rfi', 'UTG', null, '32o');
    expect(unknown).toEqual({ fold: 1.0 });
  });

  it('returns null for unloaded scenarios', () => {
    const charts = new PreflopCharts();
    const result = charts.getFrequencies('rfi', 'UTG', null, 'AA');
    expect(result).toBeNull();
  });

  it('handles vs_rfi scenario key correctly', () => {
    const charts = new PreflopCharts();
    charts.loadScenario({
      scenario: 'vs_rfi',
      position: 'BB',
      vsPosition: 'UTG',
      description: 'BB facing UTG open',
      defaultAction: 'fold',
      ranges: {
        'AA': { raise: 0.85, call: 0.15 },
        'AKs': { raise: 0.6, call: 0.4 }
      }
    });

    const aa = charts.getFrequencies('vs_rfi', 'BB', 'UTG', 'AA');
    expect(aa).toEqual({ raise: 0.85, call: 0.15 });

    // Different vsPosition returns null
    const wrong = charts.getFrequencies('vs_rfi', 'BB', 'BTN', 'AA');
    expect(wrong).toBeNull();
  });
});
