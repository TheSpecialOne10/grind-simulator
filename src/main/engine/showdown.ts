import type { Card, Player, SidePot, WinnerInfo } from '../../shared/types';
import { evaluateHand } from './hand-evaluator';
import { PotManager } from './pot-manager';

export interface ShowdownResult {
  winners: WinnerInfo[];
  awards: Map<number, number>; // seatIndex → total cents won
}

/**
 * Resolve showdown: evaluate all remaining hands, determine winners for each pot,
 * and distribute winnings.
 *
 * @param activePlayers - Players who reached showdown (not folded)
 * @param communityCards - The 5 community cards
 * @param pots - Calculated pots (main + side)
 * @param positionOrder - Seat indices in position order (for odd chip, earliest position wins)
 */
export function resolveShowdown(
  activePlayers: Player[],
  communityCards: Card[],
  pots: SidePot[],
  positionOrder: number[]
): ShowdownResult {
  // Evaluate each player's hand
  const evaluations = new Map<number, { rank: number; description: string }>();

  for (const player of activePlayers) {
    if (!player.holeCards) continue;
    const allCards = [...player.holeCards, ...communityCards];
    const result = evaluateHand(allCards);
    evaluations.set(player.seatIndex, { rank: result.rank, description: result.description });
  }

  // For each pot, determine the winner(s) among eligible players
  const winnersPerPot: number[][] = [];

  for (const pot of pots) {
    let bestRank = Infinity;
    let potWinners: number[] = [];

    for (const seat of pot.eligiblePlayers) {
      const eval_ = evaluations.get(seat);
      if (!eval_) continue;

      if (eval_.rank < bestRank) {
        bestRank = eval_.rank;
        potWinners = [seat];
      } else if (eval_.rank === bestRank) {
        potWinners.push(seat);
      }
    }

    // Sort winners by position order for odd chip assignment
    potWinners.sort((a, b) => {
      const posA = positionOrder.indexOf(a);
      const posB = positionOrder.indexOf(b);
      return posA - posB;
    });

    winnersPerPot.push(potWinners);
  }

  // Calculate awards
  const awards = PotManager.awardPots(pots, winnersPerPot);

  // Build WinnerInfo array (one entry per unique winner)
  const winnerSeats = new Set<number>();
  for (const winners of winnersPerPot) {
    for (const seat of winners) {
      winnerSeats.add(seat);
    }
  }

  const winnerInfos: WinnerInfo[] = [];
  for (const seat of winnerSeats) {
    const player = activePlayers.find(p => p.seatIndex === seat);
    const eval_ = evaluations.get(seat);
    const amount = awards.get(seat) ?? 0;

    if (player && eval_ && amount > 0) {
      winnerInfos.push({
        seatIndex: seat,
        amount,
        handDescription: eval_.description,
        cards: player.holeCards!
      });
    }
  }

  return { winners: winnerInfos, awards };
}

/**
 * Handle the case where all but one player folded (no showdown needed).
 * The last remaining player wins the entire pot.
 */
export function resolveNoShowdown(
  winnerSeatIndex: number,
  totalPot: number,
  players: Player[]
): ShowdownResult {
  const player = players.find(p => p.seatIndex === winnerSeatIndex);
  const awards = new Map<number, number>();
  awards.set(winnerSeatIndex, totalPot);

  const winners: WinnerInfo[] = [{
    seatIndex: winnerSeatIndex,
    amount: totalPot,
    handDescription: '',
    cards: player?.holeCards ?? ([{ rank: '2', suit: 'c' }, { rank: '3', suit: 'c' }] as [Card, Card])
  }];

  return { winners, awards };
}
