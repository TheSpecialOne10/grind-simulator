import type { SidePot } from '../../shared/types';

/**
 * Manages pot calculation including main pot and side pots for all-in situations.
 * All amounts in cents (integer arithmetic).
 */
export class PotManager {
  // Total amount each player has invested across all streets in this hand
  private invested: Map<number, number> = new Map();
  // Which players are still eligible for pots (not folded)
  private eligible: Set<number> = new Set();

  /** Record that a player has invested an amount (cumulative call from outside). */
  addBet(seatIndex: number, amount: number): void {
    const current = this.invested.get(seatIndex) ?? 0;
    this.invested.set(seatIndex, current + amount);
    this.eligible.add(seatIndex);
  }

  /** Mark a player as folded (ineligible for future pots, but invested remains). */
  markFolded(seatIndex: number): void {
    this.eligible.delete(seatIndex);
  }

  /** Get total amount invested by a player. */
  getInvested(seatIndex: number): number {
    return this.invested.get(seatIndex) ?? 0;
  }

  /** Get total pot (sum of all invested). */
  getTotalPot(): number {
    let total = 0;
    for (const amount of this.invested.values()) {
      total += amount;
    }
    return total;
  }

  /**
   * Calculate main pot and side pots.
   * Each pot has an amount and a list of eligible players.
   *
   * Algorithm: Sort all-in amounts, create pots layer by layer.
   * Each layer collects from all contributors up to the layer threshold.
   */
  calculatePots(): SidePot[] {
    if (this.invested.size === 0) return [];

    // Get unique invested amounts sorted ascending (only from eligible + folded)
    const allInvestments = [...this.invested.entries()];
    const uniqueAmounts = [...new Set(allInvestments.map(([, amt]) => amt))].sort((a, b) => a - b);

    const pots: SidePot[] = [];
    let previousThreshold = 0;

    for (const threshold of uniqueAmounts) {
      if (threshold <= previousThreshold) continue;

      const layerSize = threshold - previousThreshold;
      let potAmount = 0;
      const eligibleForThisPot: number[] = [];

      for (const [seat, invested] of allInvestments) {
        if (invested > previousThreshold) {
          // This player contributes to this layer
          const contribution = Math.min(invested - previousThreshold, layerSize);
          potAmount += contribution;

          // Only eligible if they haven't folded
          if (this.eligible.has(seat)) {
            eligibleForThisPot.push(seat);
          }
        }
      }

      if (potAmount > 0) {
        pots.push({ amount: potAmount, eligiblePlayers: eligibleForThisPot.sort((a, b) => a - b) });
      }

      previousThreshold = threshold;
    }

    return pots;
  }

  /**
   * Award pots to winners.
   * @param pots - The calculated pots
   * @param winnersBySeatRank - For each pot, an array of winner seat indices
   *   (multiple winners = split pot). Winners ordered by position for odd chip.
   * @returns Map of seatIndex → total amount won
   */
  static awardPots(
    pots: SidePot[],
    winnersPerPot: number[][]
  ): Map<number, number> {
    const awards = new Map<number, number>();

    for (let i = 0; i < pots.length; i++) {
      const pot = pots[i];
      const winners = winnersPerPot[i];
      if (!winners || winners.length === 0) continue;

      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;

      for (let j = 0; j < winners.length; j++) {
        const seat = winners[j];
        const award = share + (j === 0 ? remainder : 0); // Odd chip to first winner (earliest position)
        awards.set(seat, (awards.get(seat) ?? 0) + award);
      }
    }

    return awards;
  }

  /** Reset for a new hand. */
  reset(): void {
    this.invested.clear();
    this.eligible.clear();
  }
}
