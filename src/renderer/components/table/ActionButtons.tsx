import React, { useState, useEffect, useRef } from 'react';
import type { AvailableAction } from '../../../shared/types';
import { centsToDollars, BB_CENTS } from '../../../shared/constants';
import styles from '../../styles/table.module.css';

interface Props {
  actions: AvailableAction[];
  tableId: string;
  pot: number;
}

interface PresetItem {
  label: string;
  size: number;
  solverNodeId: string;
}

// Hardcoded pot-fraction presets — used only when no tree data is available
function buildFreePresets(pot: number, minAggro: number, maxAggro: number, isFacingBet: boolean, callAmount: number): PresetItem[] {
  if (maxAggro <= minAggro) return [];

  const fractions = [
    { label: '33%', fraction: 0.33 },
    { label: '50%', fraction: 0.50 },
    { label: '67%', fraction: 0.67 },
    { label: '75%', fraction: 0.75 },
    { label: 'POT', fraction: 1.0 },
  ];

  const potPresets = fractions.map(f => ({
    label: f.label,
    raw: Math.round(pot * f.fraction),
    size: Math.max(minAggro, Math.min(Math.round(pot * f.fraction), maxAggro)),
    solverNodeId: '',
  }));

  const aboveMin = potPresets.filter(p => p.raw >= minAggro);

  if (aboveMin.length >= 2) {
    const seen = new Set<number>();
    return potPresets
      .filter(p => { if (seen.has(p.size)) return false; seen.add(p.size); return true; })
      .map(p => ({ label: p.label, size: p.size, solverNodeId: '' }));
  }

  const facingAmount = isFacingBet ? Math.max(callAmount, BB_CENTS) : 0;
  const base = isFacingBet && facingAmount > BB_CENTS ? facingAmount : BB_CENTS;
  const multipliers = isFacingBet && facingAmount > BB_CENTS
    ? [{ label: '2.2x', mult: 2.2 }, { label: '2.5x', mult: 2.5 }, { label: '3x', mult: 3.0 }, { label: '4x', mult: 4.0 }]
    : [{ label: '2.5BB', mult: 2.5 }, { label: '3BB', mult: 3.0 }, { label: '4BB', mult: 4.0 }, { label: '5BB', mult: 5.0 }];

  const result: PresetItem[] = [];
  const seen = new Set<number>();
  for (const m of multipliers) {
    const size = Math.max(minAggro, Math.min(Math.round(base * m.mult), maxAggro));
    if (!seen.has(size)) { seen.add(size); result.push({ label: m.label, size, solverNodeId: '' }); }
  }
  return result;
}

// Build presets from tree-provided aggro actions, sorted smallest → largest
function buildTreePresets(aggroActions: AvailableAction[], pot: number): PresetItem[] {
  return [...aggroActions]
    .sort((a, b) => a.amount - b.amount)
    .map(a => {
      const display = a.displayAmount ?? a.amount;
      const potFraction = pot > 0 ? Math.round((display / pot) * 100) : 0;
      const label = potFraction > 0 ? `${potFraction}%` : centsToDollars(display);
      return { label, size: a.amount, solverNodeId: a.solverNodeId };
    });
}

export const ActionButtons: React.FC<Props> = React.memo(({ actions, tableId, pot }) => {
  const foldAction   = actions.find(a => a.type === 'fold');
  const checkAction  = actions.find(a => a.type === 'check');
  const callAction   = actions.find(a => a.type === 'call');
  const aggroActions = actions.filter(a => a.type === 'bet' || a.type === 'raise');

  const isFacingBet = !!foldAction;
  // Tree-constrained: actions come from solver tree (have a solverNodeId).
  // Even a single bet size from the tree should show as a preset (pot %).
  const isTreeConstrained = aggroActions.some(a => !!a.solverNodeId);

  const singleAggro = aggroActions[0] ?? null;
  const minAggro = singleAggro?.minAmount ?? 0;
  const maxAggro = singleAggro?.maxAmount ?? 0;

  // Selected aggro preset: { size, solverNodeId }
  const defaultSelected = { size: singleAggro?.amount ?? minAggro, solverNodeId: singleAggro?.solverNodeId ?? '' };
  const [selected, setSelected] = useState(defaultSelected);

  useEffect(() => {
    setSelected({ size: singleAggro?.amount ?? minAggro, solverNodeId: singleAggro?.solverNodeId ?? '' });
  }, [singleAggro?.amount, minAggro, singleAggro?.solverNodeId]);

  const presetsRef = useRef<PresetItem[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const handlePreset = (e: Event) => {
      const index = (e as CustomEvent).detail as number;
      const p = presetsRef.current;
      if (index >= 0 && index < p.length) {
        setSelected({ size: p[index].size, solverNodeId: p[index].solverNodeId });
      }
    };
    const handleBetRaise = () => {
      if (aggroActions.length > 0) {
        const s = selectedRef.current;
        const actionType = aggroActions[0].type;
        window.grindSim.sendAction(tableId, actionType as any, s.size, s.solverNodeId);
      }
    };
    document.addEventListener('grindSim:preset', handlePreset);
    document.addEventListener('grindSim:betRaise', handleBetRaise);
    return () => {
      document.removeEventListener('grindSim:preset', handlePreset);
      document.removeEventListener('grindSim:betRaise', handleBetRaise);
    };
  }, [tableId, aggroActions[0]?.type]);

  if (actions.length === 0) return null;

  const send = (type: string, amount: number, solverNodeId = '') =>
    window.grindSim.sendAction(tableId, type as any, amount, solverNodeId);

  const aggroType = aggroActions[0]?.type ?? 'bet';
  const hasAggro  = aggroActions.length > 0;

  // Build presets: from tree if constrained, from pot fractions if free-sizing
  const presets = isTreeConstrained
    ? buildTreePresets(aggroActions, pot)
    : (hasAggro && maxAggro > 0
        ? buildFreePresets(pot, minAggro, maxAggro, isFacingBet, callAction?.amount ?? 0)
        : []);
  presetsRef.current = presets;

  // Default selected to first preset when tree changes
  useEffect(() => {
    if (isTreeConstrained && presets.length > 0) {
      setSelected({ size: presets[0].size, solverNodeId: presets[0].solverNodeId });
    }
  }, [isTreeConstrained, presets[0]?.solverNodeId]);

  const allInPreset: PresetItem = { label: 'ALL IN', size: maxAggro, solverNodeId: singleAggro?.solverNodeId ?? '' };

  // Display amount for the selected aggro action (increment, not cumulative)
  const selectedDisplayAmt = aggroActions.find(a => a.solverNodeId === selected.solverNodeId)?.displayAmount ?? selected.size;

  return (
    <div className={styles.actionPanel}>
      {hasAggro && presets.length > 0 && (
        <div className={styles.presetRow}>
          {presets.map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              className={`${styles.presetBtn} ${selected.size === p.size ? styles.presetBtnActive : ''}`}
              onClick={() => setSelected({ size: p.size, solverNodeId: p.solverNodeId })}
            >
              {p.label}
            </button>
          ))}
          {!isTreeConstrained && (
            <button
              className={`${styles.presetBtn} ${selected.size === maxAggro ? styles.presetBtnActive : ''}`}
              onClick={() => setSelected(allInPreset)}
            >
              ALL IN
            </button>
          )}
        </div>
      )}

      <div className={styles.mainActions}>
        {isFacingBet ? (
          <>
            <button
              className={`${styles.actionBtn} ${styles.btnFold}`}
              onClick={() => send('fold', 0, foldAction?.solverNodeId)}
            >
              FOLD
            </button>
            {callAction && (
              <button
                className={`${styles.actionBtn} ${styles.btnCall}`}
                onClick={() => send('call', callAction.amount, callAction.solverNodeId)}
              >
                <span className={styles.actionBtnLabel}>CALL</span>
                <span className={styles.actionBtnAmount}>{centsToDollars(callAction.amount)}</span>
              </button>
            )}
            {hasAggro && (
              <button
                className={`${styles.actionBtn} ${styles.btnRaise}`}
                onClick={() => send(aggroType, selected.size, selected.solverNodeId)}
              >
                <span className={styles.actionBtnLabel}>RAISE</span>
                <span className={styles.actionBtnAmount}>{centsToDollars(selectedDisplayAmt)}</span>
              </button>
            )}
          </>
        ) : (
          <>
            {checkAction && (
              <button
                className={`${styles.actionBtn} ${styles.btnCheck}`}
                onClick={() => send('check', 0, checkAction.solverNodeId)}
              >
                <span className={styles.actionBtnLabel}>CHECK</span>
              </button>
            )}
            {hasAggro && (
              <button
                className={`${styles.actionBtn} ${styles.btnBet}`}
                onClick={() => send(aggroType, selected.size, selected.solverNodeId)}
              >
                <span className={styles.actionBtnLabel}>BET</span>
                <span className={styles.actionBtnAmount}>{centsToDollars(selectedDisplayAmt)}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});
