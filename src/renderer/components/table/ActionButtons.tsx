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
}

function buildPresets(pot: number, minAggro: number, maxAggro: number, isFacingBet: boolean, callAmount: number): PresetItem[] {
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
  }));

  const aboveMin = potPresets.filter(p => p.raw >= minAggro);

  if (aboveMin.length >= 2) {
    const seen = new Set<number>();
    return potPresets
      .filter(p => { if (seen.has(p.size)) return false; seen.add(p.size); return true; })
      .map(p => ({ label: p.label, size: p.size }));
  }

  // Use BB as base for multipliers — works for both open-raise and facing-bet scenarios
  // When facing a larger raise, use the raise amount as base instead
  const facingAmount = isFacingBet ? Math.max(callAmount, BB_CENTS) : 0;
  const base = isFacingBet && facingAmount > BB_CENTS ? facingAmount : BB_CENTS;

  const multipliers = isFacingBet && facingAmount > BB_CENTS
    ? [{ label: '2.2x', mult: 2.2 }, { label: '2.5x', mult: 2.5 }, { label: '3x', mult: 3.0 }, { label: '4x', mult: 4.0 }]
    : [{ label: '2.5BB', mult: 2.5 }, { label: '3BB', mult: 3.0 }, { label: '4BB', mult: 4.0 }, { label: '5BB', mult: 5.0 }];

  const result: PresetItem[] = [];
  const seen = new Set<number>();
  for (const m of multipliers) {
    const size = Math.max(minAggro, Math.min(Math.round(base * m.mult), maxAggro));
    if (!seen.has(size)) { seen.add(size); result.push({ label: m.label, size }); }
  }
  return result;
}

export const ActionButtons: React.FC<Props> = React.memo(({ actions, tableId, pot }) => {
  if (actions.length === 0) return null;

  const foldAction = actions.find(a => a.type === 'fold');
  const checkAction = actions.find(a => a.type === 'check');
  const callAction = actions.find(a => a.type === 'call');
  const aggroAction = actions.find(a => a.type === 'bet' || a.type === 'raise');

  const isFacingBet = !!foldAction;
  const minAggro = aggroAction?.minAmount ?? 0;
  const maxAggro = aggroAction?.maxAmount ?? 0;
  const hasAggro = aggroAction && maxAggro > 0;

  const [selectedSize, setSelectedSize] = useState(aggroAction?.amount ?? minAggro);

  useEffect(() => {
    setSelectedSize(aggroAction?.amount ?? minAggro);
  }, [aggroAction?.amount, minAggro]);

  const presets = hasAggro
    ? buildPresets(pot, minAggro, maxAggro, isFacingBet, callAction?.amount ?? 0)
    : [];

  const presetsRef = useRef(presets);
  presetsRef.current = presets;

  const selectedSizeRef = useRef(selectedSize);
  selectedSizeRef.current = selectedSize;

  useEffect(() => {
    const handlePreset = (e: Event) => {
      const index = (e as CustomEvent).detail as number;
      const p = presetsRef.current;
      if (index >= 0 && index < p.length) {
        setSelectedSize(p[index].size);
      }
    };
    const handleBetRaise = () => {
      if (aggroAction) {
        window.grindSim.sendAction(tableId, aggroAction.type, selectedSizeRef.current, '');
      }
    };

    document.addEventListener('grindSim:preset', handlePreset);
    document.addEventListener('grindSim:betRaise', handleBetRaise);
    return () => {
      document.removeEventListener('grindSim:preset', handlePreset);
      document.removeEventListener('grindSim:betRaise', handleBetRaise);
    };
  }, [tableId, aggroAction?.type]);

  const handleSend = (type: string, amount: number) => {
    window.grindSim.sendAction(tableId, type as any, amount, '');
  };

  const handleAllIn = () => {
    setSelectedSize(maxAggro);
  };

  return (
    <div className={styles.actionPanel}>
      {hasAggro && presets.length > 0 && (
        <div className={styles.presetRow}>
          {presets.map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              className={styles.presetBtn}
              onClick={() => setSelectedSize(p.size)}
            >
              {p.label}
            </button>
          ))}
          <button className={styles.presetBtn} onClick={handleAllIn}>
            ALL IN
          </button>
        </div>
      )}

      <div className={styles.mainActions}>
        {isFacingBet ? (
          <>
            <button
              className={`${styles.actionBtn} ${styles.btnFold}`}
              onClick={() => handleSend('fold', 0)}
            >
              FOLD
            </button>
            {callAction && (
              <button
                className={`${styles.actionBtn} ${styles.btnCall}`}
                onClick={() => handleSend('call', callAction.amount)}
              >
                <span className={styles.actionBtnLabel}>CALL</span>
                <span className={styles.actionBtnAmount}>{centsToDollars(callAction.amount)}</span>
              </button>
            )}
            {hasAggro && (
              <button
                className={`${styles.actionBtn} ${styles.btnRaise}`}
                onClick={() => handleSend(aggroAction!.type, selectedSize)}
              >
                <span className={styles.actionBtnLabel}>RAISE</span>
                <span className={styles.actionBtnAmount}>{centsToDollars(selectedSize)}</span>
              </button>
            )}
          </>
        ) : (
          <>
            {checkAction && (
              <button
                className={`${styles.actionBtn} ${styles.btnCheck}`}
                onClick={() => handleSend('check', 0)}
              >
                <span className={styles.actionBtnLabel}>CHECK</span>
              </button>
            )}
            {hasAggro && (
              <button
                className={`${styles.actionBtn} ${styles.btnBet}`}
                onClick={() => handleSend(aggroAction!.type, selectedSize)}
              >
                <span className={styles.actionBtnLabel}>BET</span>
                <span className={styles.actionBtnAmount}>{centsToDollars(selectedSize)}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});
