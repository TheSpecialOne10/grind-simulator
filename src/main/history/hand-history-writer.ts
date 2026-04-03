import { appendFileSync } from 'node:fs';
import type { HandState } from '../../shared/types';
import { formatHand } from './pokerstars-format';
import { SessionManager } from './session-manager';

/**
 * Writes hand histories to disk in PokerStars format.
 * One file per table per session, append mode.
 */
export class HandHistoryWriter {
  private sessionManager: SessionManager;

  constructor(basePath: string) {
    this.sessionManager = new SessionManager(basePath);
  }

  /**
   * Write a completed hand to the appropriate file.
   * @param handState - The completed hand state
   * @param tableIndex - 0-based index of the table (for naming)
   */
  writeHand(handState: HandState, tableIndex: number): void {
    const tableName = SessionManager.getTableName(tableIndex);
    const filePath = this.sessionManager.getFilePath(handState.tableId, tableIndex);
    const formatted = formatHand(handState, tableName, new Date());

    try {
      appendFileSync(filePath, formatted);
    } catch (err) {
      console.error(`Failed to write hand history to ${filePath}:`, err);
    }
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }
}
