import React from 'react';
import type { TableSnapshot } from '../../../shared/types';
import { Seat } from './Seat';
import { CommunityCards } from './CommunityCards';
import { Pot } from './Pot';
import { DealerButton } from './DealerButton';
import { ActionButtons } from './ActionButtons';
import { WinnerOverlay } from './WinnerOverlay';
import { PreflopFeedbackSquare } from './PreflopFeedbackSquare';
import { useHotkeys } from '../../hooks/useHotkeys';
import { usePreflopFeedback } from '../../hooks/usePreflopFeedback';
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
  const { scale, containerRef } = useTableScale();

  // Zoom early fold: show a FOLD button whenever it's NOT the hero's turn and hand is in progress
  const showEarlyFold = snapshot.zoomMode && !isHumanTurn && !snapshot.isHandComplete && !snapshot.heroHasActed;

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

          {preflopFeedback && (
            <PreflopFeedbackSquare state={preflopFeedback} />
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
