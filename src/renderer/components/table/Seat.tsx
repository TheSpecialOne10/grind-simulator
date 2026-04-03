import React from 'react';
import type { PlayerSnapshot } from '../../../shared/types';
import { centsToDollars } from '../../../shared/constants';
import { PlayerCards } from './PlayerCards';
import { ChipStack } from './ChipStack';
import { Timer } from './Timer';
import styles from '../../styles/table.module.css';

interface Props {
  player: PlayerSnapshot;
  seatIndex: number;
  isHumanSeat: boolean;
  isCurrentActor: boolean;
  timeRemaining: number;
}

const SEAT_CLASSES = [styles.seat0, styles.seat1, styles.seat2, styles.seat3, styles.seat4, styles.seat5];
const BET_CLASSES = [styles.bet0, styles.bet1, styles.bet2, styles.bet3, styles.bet4, styles.bet5];

export const Seat: React.FC<Props> = React.memo(({ player, seatIndex, isHumanSeat, isCurrentActor, timeRemaining }) => {
  const seatClass = SEAT_CLASSES[seatIndex] ?? SEAT_CLASSES[0];
  const betClass = BET_CLASSES[seatIndex] ?? BET_CLASSES[0];

  const infoClasses = [
    styles.seatInfo,
    isCurrentActor ? styles.currentActor : '',
    !player.isActive ? styles.folded : '',
  ].filter(Boolean).join(' ');

  const showCards = player.holeCards !== null;

  return (
    <>
      <div className={`${styles.seat} ${seatClass}`}>
        {showCards && (
          <PlayerCards
            holeCards={player.holeCards}
            isHidden={!isHumanSeat && player.holeCards !== null}
            isHero={isHumanSeat}
          />
        )}
        <div className={infoClasses}>
          <span className={styles.playerName}>{player.name}</span>
          <span className={styles.playerStack}>{centsToDollars(player.stack)}</span>
        </div>
        {/* Timer bar below avatar — only for the current actor */}
        {isCurrentActor && (
          <Timer
            timeRemaining={timeRemaining}
            seatIndex={seatIndex}
            isActive={true}
          />
        )}
      </div>

      {player.currentBet > 0 && (
        <div className={`${styles.playerBet} ${betClass} bet-enter`}>
          <ChipStack amount={player.currentBet} />
        </div>
      )}
    </>
  );
});
