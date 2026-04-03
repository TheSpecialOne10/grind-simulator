import React from 'react';
import type { TableSnapshot } from '../../../shared/types';
import { Seat } from './Seat';
import { CommunityCards } from './CommunityCards';
import { Pot } from './Pot';
import { DealerButton } from './DealerButton';
import { ActionButtons } from './ActionButtons';
import { WinnerOverlay } from './WinnerOverlay';
import tableImg from '../../assets/table/table.png';
import styles from '../../styles/table.module.css';

interface Props {
  snapshot: TableSnapshot;
  humanSeatIndex: number;
}

export const PokerTable: React.FC<Props> = React.memo(({ snapshot, humanSeatIndex }) => {
  const isHumanTurn = snapshot.currentPlayerIndex === humanSeatIndex && !snapshot.isHandComplete;

  return (
    <div className={styles.tableContainer}>
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
          />
        ))}

        <CommunityCards cards={snapshot.communityCards} />
        <Pot pot={snapshot.pot} />
        <DealerButton buttonSeatIndex={snapshot.buttonSeatIndex} />

        {snapshot.isHandComplete && snapshot.winnerInfo && (
          <WinnerOverlay winners={snapshot.winnerInfo} />
        )}
      </div>

      {/* Action panel — bottom-right, outside the table oval */}
      {isHumanTurn && snapshot.availableActions && snapshot.availableActions.length > 0 && (
        <ActionButtons
          actions={snapshot.availableActions}
          tableId={snapshot.tableId}
          pot={snapshot.pot}
        />
      )}
    </div>
  );
});
