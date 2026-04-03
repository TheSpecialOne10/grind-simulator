import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

export class SessionManager {
  private basePath: string;
  private sessionStart: Date;
  private filePaths: Map<string, string> = new Map();

  constructor(basePath: string) {
    this.basePath = basePath;
    this.sessionStart = new Date();
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  /** Get the table display name (e.g., "Grind Sim III"). */
  static getTableName(tableIndex: number): string {
    return `Grind Sim ${ROMAN[tableIndex] ?? String(tableIndex + 1)}`;
  }

  /**
   * Get the file path for a table's hand history.
   * Creates the file path on first call, reuses on subsequent calls.
   * Format: HH_GrindSim_TABLENAME_YYYYMMDD_HHMMSS.txt
   */
  getFilePath(tableId: string, tableIndex: number): string {
    let path = this.filePaths.get(tableId);
    if (path) return path;

    const tableName = SessionManager.getTableName(tableIndex);
    const safeName = tableName.replace(/\s+/g, '_');
    const dateStr = formatFileDate(this.sessionStart);
    const fileName = `HH_GrindSim_${safeName}_${dateStr}.txt`;
    path = join(this.basePath, fileName);
    this.filePaths.set(tableId, path);
    return path;
  }

  getBasePath(): string {
    return this.basePath;
  }
}

function formatFileDate(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}_${h}${mi}${s}`;
}
