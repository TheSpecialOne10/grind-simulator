import React, { useState, useEffect, useRef } from 'react';
import type { PlayerSnapshot, Action } from '../../../shared/types';
import { centsToDollars } from '../../../shared/constants';
import { PlayerCards } from './PlayerCards';
import { ChipStack } from './ChipStack';
import { Timer } from './Timer';
import downcardsImg from '../../assets/table/downcards2-sm.png';
import styles from '../../styles/table.module.css';

interface Props {
  player: PlayerSnapshot;
  seatIndex: number;
  isHumanSeat: boolean;
  isCurrentActor: boolean;
  timeRemaining: number;
  handInProgress: boolean;
  lastAction: Action | null;
}

const BUBBLE_LABELS: Partial<Record<string, string>> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
};

const BUBBLE_CLASSES: Partial<Record<string, string>> = {
  fold: styles.bubbleFold,
  check: styles.bubbleCheckCall,
  call: styles.bubbleCheckCall,
  bet: styles.bubbleBetRaise,
  raise: styles.bubbleBetRaise,
};

const SEAT_CLASSES = [styles.seat0, styles.seat1, styles.seat2, styles.seat3, styles.seat4, styles.seat5];
const BET_CLASSES = [styles.bet0, styles.bet1, styles.bet2, styles.bet3, styles.bet4, styles.bet5];

export const Seat: React.FC<Props> = React.memo(({ player, seatIndex, isHumanSeat, isCurrentActor, timeRemaining, handInProgress, lastAction }) => {
  const seatClass = SEAT_CLASSES[seatIndex] ?? SEAT_CLASSES[0];
  const betClass = BET_CLASSES[seatIndex] ?? BET_CLASSES[0];

  const isFolded = !player.isActive;
  const hasRealCards = player.holeCards !== null;

  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBubbleTs = useRef(0);

  useEffect(() => {
    if (!lastAction || lastAction.playerSeatIndex !== seatIndex) return;
    // Dedup: IPC structured clone creates new references for the same action.
    // Use timestamp to detect truly new actions vs re-emitted snapshots.
    if (lastAction.timestamp === lastBubbleTs.current) return;
    lastBubbleTs.current = lastAction.timestamp;
    const label = BUBBLE_LABELS[lastAction.type];
    if (!label) return;
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble(lastAction.type);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), 3000);
  }, [lastAction, seatIndex]);

  const infoClasses = [
    styles.seatInfo,
    isCurrentActor ? styles.currentActor : '',
    isFolded ? styles.folded : '',
  ].filter(Boolean).join(' ');

  // Hero: dim the whole seat when folded
  const seatStyle: React.CSSProperties = isHumanSeat && isFolded
    ? { opacity: 0.4 }
    : {};

  return (
    <>
      <div className={`${styles.seat} ${seatClass}`} style={seatStyle}>
        {/* Hero: real cards (dimmed via parent when folded) */}
        {isHumanSeat && hasRealCards && (
          <PlayerCards
            holeCards={player.holeCards!}
            isHidden={false}
            isHero={true}
          />
        )}

        {/* Bot at showdown: revealed cards */}
        {!isHumanSeat && hasRealCards && (
          <PlayerCards
            holeCards={player.holeCards!}
            isHidden={false}
            isHero={false}
          />
        )}

        {/* Bot downcards: always rendered to preserve layout, hidden when folded or hand over */}
        {!isHumanSeat && !hasRealCards && (
          <img
            src={downcardsImg}
            alt="cards"
            className={styles.downcards}
            style={{ visibility: (handInProgress && !isFolded) ? 'visible' : 'hidden' }}
            draggable={false}
          />
        )}

        {bubble && (
          <div className={`${styles.actionBubble} ${BUBBLE_CLASSES[bubble] ?? ''}`}>
            {BUBBLE_LABELS[bubble]}
          </div>
        )}

        <div className={infoClasses}>
          <span className={styles.playerName}>{player.name}</span>
          <div className={styles.playerSeparator} />
          <span className={styles.playerStack}>{centsToDollars(player.stack)}</span>
        </div>
        <Timer
          timeRemaining={timeRemaining}
          seatIndex={seatIndex}
          isActive={isCurrentActor}
        />
      </div>

      {player.currentBet > 0 && (
        <div className={`${styles.playerBet} ${betClass} bet-enter`}>
          <ChipStack amount={player.currentBet} />
        </div>
      )}
    </>
  );
});
