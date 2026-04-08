import React from 'react';
import type { TableSnapshot, ActionFrequency } from '../../../shared/types';
import { Seat } from './Seat';
import { CommunityCards } from './CommunityCards';
import { Pot } from './Pot';
import { DealerButton } from './DealerButton';
import { ActionButtons } from './ActionButtons';
import { WinnerOverlay } from './WinnerOverlay';
import { PreflopFeedbackSquare } from './PreflopFeedbackSquare';
import { useHotkeys } from '../../hooks/useHotkeys';
import { usePreflopFeedback } from '../../hooks/usePreflopFeedback';
import { usePostflopFeedback } from '../../hooks/usePostflopFeedback';
import { useTableScale } from '../../hooks/useTableScale';
import tableImg from '../../assets/table/table3.png';
import styles from '../../styles/table.module.css';

interface Props {
  snapshot: TableSnapshot;
  humanSeatIndex: number;
}

export const PokerTable: React.FC<Props> = React.memo(({ snapshot, humanSeatIndex }) => {
  const isHumanTurn = snapshot.currentPlayerIndex === humanSeatIndex && !snapshot.isHandComplete;
  const preflopFeedback = usePreflopFeedback(snapshot.tableId, snapshot.handId);
  const postflopFeedback = usePostflopFeedback(snapshot.tableId, snapshot.handId);
  const { scale, containerRef } = useTableScale();

  // Normalize postflop feedback into the same shape as preflop feedback for unified rendering
  const normalizedPostflopFeedback = postflopFeedback ? {
    data: {
      canonicalHand: postflopFeedback.data.heroCards,
      result: postflopFeedback.data.result,
      frequencies: Object.fromEntries(
        postflopFeedback.data.actions.map(a => [a.type, a.frequency])
      ) as ActionFrequency,
      heroAction: postflopFeedback.data.heroAction,
      rng: 0,
      // Pass individual sizings + pot info for pot% labels
      detailedActions: postflopFeedback.data.actions,
      chipToDollar: postflopFeedback.data.chipToDollar,
      potChips: postflopFeedback.data.potChips,
    },
    fading: postflopFeedback.fading,
  } : null;

  const activeFeedback = normalizedPostflopFeedback ?? preflopFeedback;

  // Zoom early fold: show a FOLD button whenever it's NOT the hero's turn and hand is in progress
  // Not available in spot mode (no zoom in spot training)
  const showEarlyFold = snapshot.zoomMode && !snapshot.spotMode && !isHumanTurn && !snapshot.isHandComplete && !snapshot.heroHasActed;

  useHotkeys({
    tableId: snapshot.tableId,
    actions: isHumanTurn ? snapshot.availableActions : null,
    zoomEarlyFold: showEarlyFold,
  });

  return (
    <div className={styles.tableContainer} ref={containerRef}>
      <div
        className={styles.tableScaler}
        style={{ '--table-scale': scale } as React.CSSProperties}
      >
        <div className={styles.tableOval}>
          <img src={tableImg} alt="" className={styles.tableBg} draggable={false} />

          {snapshot.players.map(player => (
            <Seat
              key={player.seatIndex}
              player={player}
              seatIndex={player.seatIndex}
              isHumanSeat={player.seatIndex === humanSeatIndex}
              isCurrentActor={player.seatIndex === snapshot.currentPlayerIndex && !snapshot.isHandComplete}
              timeRemaining={snapshot.timeRemaining}
              handInProgress={!snapshot.isHandComplete}
              lastAction={snapshot.lastAction}
            />
          ))}

          <CommunityCards cards={snapshot.communityCards} />
          <Pot pot={snapshot.pot} />
          <DealerButton buttonSeatIndex={snapshot.buttonSeatIndex} />

          {snapshot.isHandComplete && snapshot.winnerInfo && (
            <WinnerOverlay winners={snapshot.winnerInfo} />
          )}

          {snapshot.preflopRng != null && (
            <div className={styles.preflopRng}>{snapshot.preflopRng}</div>
          )}

          {activeFeedback && (
            <PreflopFeedbackSquare state={activeFeedback} />
          )}
        </div>

        {isHumanTurn && snapshot.availableActions && snapshot.availableActions.length > 0 && (
          <ActionButtons
            actions={snapshot.availableActions}
            tableId={snapshot.tableId}
            pot={snapshot.pot}
          />
        )}

        {showEarlyFold && (
          <div className={styles.actionPanel}>
            <div className={styles.mainActions}>
              <button
                className={`${styles.actionBtn} ${styles.btnFold}`}
                onClick={() => window.grindSim.zoomFoldEarly(snapshot.tableId)}
              >
                FOLD NOW
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
