import { BrowserWindow, screen } from 'electron';
import type { HandState } from '../shared/types';
import { BB_CENTS } from '../shared/constants';
import { IPC } from '../shared/ipc-channels';
import { GameEngine } from './engine/game-engine';
import { BotController } from './bot/bot-controller';
import { PreflopCharts } from './bot/preflop-charts';
import { HandHistoryWriter } from './history/hand-history-writer';
import type { ActionProvider } from './engine/types';
import { join } from 'node:path';
import type { SpotConfig } from './spot-trainer/spot-config';
import { getRangeRefs } from './spot-trainer/spot-config';
import type { HeroSide } from './spot-trainer/spot-config';
import { sampleSpotHands } from './spot-trainer/hand-sampler';
import type { IPostflopApiClient } from './spot-trainer/postflop-api-client';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

const BOT_NAMES = [
  'xXPokerProXx', 'FishOnTilt', 'AcesUpMySleeve', 'NittyProfessor',
  '3BetBandit', 'RiverRat420', 'GTO_Wizard', 'StackEmUp',
  'FoldPre2024', 'Button_Clicker', 'ChetFaker99', 'TiltMachine',
  'SuitsMe', 'PotCommitted', 'Bluffy_McBluff', 'QuadsOrFold',
  'RunBadFeelGood', 'SharkBait55', 'PocketRockets', 'DonkeyKong42',
  'FlushDraw_Hero', 'SetMiner_Pro', 'OverBet4Value', 'CheckRaiseKing',
  'NLHE_Grinder', 'ColdDeck_Carl', 'BarrelHouse', 'ValueTown_Mayor',
  'bluff_catcher', 'the_nuts_42', 'SBvsUTG', '4betJam',
  'RunItTwice', 'QuietNit', 'AggroManiac', 'SteadyEddie',
  'CardDead_Chris', 'SuckoutKid', 'TriplBarrel', 'MegaTilt',
  'NiceCatch88', 'FlopZilla', 'SnapFold', 'TheGrinder',
  'WetBoard_Willy', 'TightIsRight', 'LooseGoose', 'SlowRoll_Sam',
];

export class TableManager {
  private engines: Map<string, GameEngine> = new Map();
  private tableWindows: Map<string, BrowserWindow> = new Map();
  private charts: PreflopCharts;
  private botController: BotController;
  private hhWriter: HandHistoryWriter | null = null;
  private usedBotNames: Set<string> = new Set();
  private pendingActions: Map<string, (action: { type: string; amount: number; solverNodeId?: string }) => void> = new Map();
  /** Latest UI actions per table — used by timeout handler to find correct solverNodeId */
  private currentUiActions: Map<string, import('../shared/types').AvailableAction[]> = new Map();
  private tableIndexMap: Map<string, number> = new Map();

  // Zoom mode
  private zoomMode: boolean = false;
  private earlyFoldTables: Set<string> = new Set();

  constructor(_lobbyWindow: BrowserWindow, charts: PreflopCharts) {
    this.charts = charts;
    this.botController = new BotController(charts, true);
  }

  startSession(tableCount: number, playerName: string, hhPath?: string, revealBotCards = false, zoomMode = false): void {
    this.stopSession();
    this.usedBotNames.clear();
    this.tableIndexMap.clear();

    const basePath = hhPath || join(process.cwd(), 'data', 'hand-histories');
    this.hhWriter = new HandHistoryWriter(basePath);
    this.zoomMode = zoomMode;

    for (let i = 0; i < tableCount; i++) {
      const tableId = `table-${i + 1}`;
      const tableName = `Grind Sim ${ROMAN[i] ?? (i + 1)}`;
      const botNames = this.pickBotNames(5);
      const humanSeatIndex = 0;
      const playerNames = [playerName, ...botNames];
      this.tableIndexMap.set(tableId, i);

      this.createTableWindow(tableId, tableName, i, tableCount);

      const actionProvider: ActionProvider = {
        getAction: async (handState, seatIndex, validActions) => {
          if (seatIndex === humanSeatIndex) {
            return this.waitForHumanAction(tableId, handState, validActions);
          }
          // Zoom fast-mode: skip bot delays so the tail of the hand finishes instantly
          if (zoomMode && this.engines.get(tableId)?.isZoomFastMode) {
            const d = this.botController.decide(handState, seatIndex, validActions);
            return { type: d.action, amount: d.amount };
          }
          return this.botController.getAction(handState, seatIndex, validActions);
        }
      };

      const engine = new GameEngine({
        tableId,
        humanSeatIndex,
        playerNames,
        actionProvider,
        charts: this.charts,
        revealBotCards,
        zoomMode,
        onSnapshot: (tid, snapshot) => {
          // Suppress fast-mode snapshots — bots finishing at 0-delay isn't meaningful to show
          if (zoomMode && this.engines.get(tid)?.isZoomFastMode) return;
          const win = this.tableWindows.get(tid);
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.TABLE_STATE_UPDATE, snapshot);
          }
        },
        onSound: (tid, sound) => {
          if (zoomMode && this.engines.get(tid)?.isZoomFastMode) return;
          const win = this.tableWindows.get(tid);
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.SOUND_TRIGGER, { sound, volume: 1.0, tableId: tid });
          }
        },
        onHandComplete: (tid, handState) => {
          const tableIdx = this.tableIndexMap.get(tid) ?? 0;
          this.hhWriter?.writeHand(handState, tableIdx);
          // Zoom: reroll bot names so the next hand feels like a new table
          if (zoomMode) {
            this.engines.get(tid)?.rerollBotNames(this.pickFreshBotNames(5));
          }
        },
        onPreflopFeedback: (tid, feedback) => {
          const win = this.tableWindows.get(tid);
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PREFLOP_FEEDBACK, feedback);
          }
        }
      });

      this.engines.set(tableId, engine);
    }
  }

  handleTableReady(tableId: string): void {
    const engine = this.engines.get(tableId);
    const win = this.tableWindows.get(tableId);
    if (engine && win && !win.isDestroyed()) {
      win.webContents.send(IPC.TABLE_INIT, { tableId, humanSeatIndex: 0 });
      engine.start().catch(err => console.error(`Engine error on ${tableId}:`, err));
    }
  }

  stopSession(): void {
    for (const [id, engine] of this.engines) {
      engine.stop();
      const pending = this.pendingActions.get(id);
      if (pending) {
        pending({ type: 'fold', amount: 0 });
        this.pendingActions.delete(id);
      }
    }
    this.engines.clear();
    this.earlyFoldTables.clear();
    this.zoomMode = false;

    for (const [, win] of this.tableWindows) {
      if (!win.isDestroyed()) win.close();
    }
    this.tableWindows.clear();
  }

  handlePlayerAction(tableId: string, action: string, amount: number, solverNodeId: string): void {
    const resolve = this.pendingActions.get(tableId);
    if (resolve) {
      resolve({ type: action, amount, solverNodeId });
      this.pendingActions.delete(tableId);
    }
    // Zoom: fold triggers fast-mode so remaining bots finish the hand instantly
    if (this.zoomMode && action === 'fold') {
      this.engines.get(tableId)?.enterZoomFastMode();
    }
  }

  /**
   * Compute tiling layout for N tables on the primary display.
   * Returns { cols, rows, cellWidth, cellHeight, windowWidth, windowHeight }
   * where window dimensions maintain the table aspect ratio (792:546).
   */
  private computeTileLayout(tableCount: number): {
    cols: number; rows: number;
    cellWidth: number; cellHeight: number;
    windowWidth: number; windowHeight: number;
    workArea: { x: number; y: number; width: number; height: number };
  } {
    const TABLE_ASPECT = 792 / 594;
    const display = screen.getPrimaryDisplay();
    const { x, y, width: screenW, height: screenH } = display.workArea;

    const fitWindow = (cols: number, rows: number): { w: number; h: number } => {
      const cellW = Math.floor(screenW / cols);
      const cellH = Math.floor(screenH / rows);
      let winW = cellW;
      let winH = Math.round(winW / TABLE_ASPECT);
      if (winH > cellH) { winH = cellH; winW = Math.round(winH * TABLE_ASPECT); }
      return { w: winW, h: winH };
    };

    // Grid arrangement is based on actual table count
    let bestCols = 1, bestRows = 1, bestGridArea = 0;
    for (let cols = 1; cols <= tableCount; cols++) {
      const rows = Math.ceil(tableCount / cols);
      const { w, h } = fitWindow(cols, rows);
      if (w * h > bestGridArea) { bestGridArea = w * h; bestCols = cols; bestRows = rows; }
    }

    // Window SIZE uses at least 4 tables so 1/2/3-table sessions match the 4-table window size
    const sizeCount = Math.max(tableCount, 4);
    let bestWindowW = 0, bestWindowH = 0, bestSizeArea = 0;
    for (let cols = 1; cols <= sizeCount; cols++) {
      const rows = Math.ceil(sizeCount / cols);
      const { w, h } = fitWindow(cols, rows);
      if (w * h > bestSizeArea) { bestSizeArea = w * h; bestWindowW = w; bestWindowH = h; }
    }

    return {
      cols: bestCols,
      rows: bestRows,
      cellWidth: Math.floor(screenW / bestCols),
      cellHeight: Math.floor(screenH / bestRows),
      windowWidth: bestWindowW,
      windowHeight: bestWindowH,
      workArea: { x, y, width: screenW, height: screenH },
    };
  }

  private createTableWindow(tableId: string, tableName: string, tableIndex: number, tableCount: number): BrowserWindow {
    const layout = this.computeTileLayout(tableCount);
    const col = tableIndex % layout.cols;
    const row = Math.floor(tableIndex / layout.cols);

    // Pack windows side-by-side with no gaps, center the whole block horizontally
    const totalGridW = layout.cols * layout.windowWidth;
    const totalGridH = layout.rows * layout.windowHeight;
    const offsetX = layout.workArea.x + Math.floor((layout.workArea.width - totalGridW) / 2);
    const offsetY = layout.workArea.y + Math.floor((layout.workArea.height - totalGridH) / 2);
    const winX = offsetX + col * layout.windowWidth;
    const winY = offsetY + row * layout.windowHeight;

    const tableWindow = new BrowserWindow({
      width: layout.windowWidth,
      height: layout.windowHeight,
      x: winX,
      y: winY,
      title: tableName,
      frame: false,
      maximizable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    });

    // Load renderer with tableId query parameter
    if (process.env.ELECTRON_RENDERER_URL) {
      tableWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?tableId=${tableId}`);
    } else {
      tableWindow.loadFile(
        join(__dirname, '../renderer/index.html'),
        { query: { tableId } }
      );
    }

    // If user closes a table window, fold the human and stop that engine
    tableWindow.on('closed', () => {
      this.tableWindows.delete(tableId);
      const engine = this.engines.get(tableId);
      if (engine) {
        engine.stop();
        this.engines.delete(tableId);
      }
      const pending = this.pendingActions.get(tableId);
      if (pending) {
        pending({ type: 'fold', amount: 0 });
        this.pendingActions.delete(tableId);
      }
    });

    this.tableWindows.set(tableId, tableWindow);
    return tableWindow;
  }

  /** Store the latest available actions for a table (used by timeout to get correct solverNodeId). */
  setCurrentUiActions(tableId: string, actions: import('../shared/types').AvailableAction[] | null): void {
    if (actions) {
      this.currentUiActions.set(tableId, actions);
    } else {
      this.currentUiActions.delete(tableId);
    }
  }

  private waitForHumanAction(
    tableId: string,
    _handState: HandState,
    validActions: { type: string; minAmount: number; maxAmount: number }[]
  ): Promise<{ type: string; amount: number; solverNodeId?: string }> {
    // Early fold was registered before hero's turn — resolve immediately
    if (this.earlyFoldTables.has(tableId)) {
      this.earlyFoldTables.delete(tableId);
      this.engines.get(tableId)?.enterZoomFastMode();
      return Promise.resolve({ type: 'fold', amount: 0 });
    }

    return new Promise((resolve) => {
      this.pendingActions.set(tableId, resolve);

      const timeout = setTimeout(() => {
        if (this.pendingActions.has(tableId)) {
          this.pendingActions.delete(tableId);
          // Look up the solverNodeId from the current UI actions (tree-provided)
          const uiActions = this.currentUiActions.get(tableId);
          const check = validActions.find(a => a.type === 'check');
          if (check) {
            const nodeId = uiActions?.find(a => a.type === 'check')?.solverNodeId ?? '';
            resolve({ type: 'check', amount: 0, solverNodeId: nodeId });
          } else {
            const nodeId = uiActions?.find(a => a.type === 'fold')?.solverNodeId ?? '';
            resolve({ type: 'fold', amount: 0, solverNodeId: nodeId });
          }
        }
      }, 30_000);

      const origResolve = this.pendingActions.get(tableId)!;
      this.pendingActions.set(tableId, (action) => {
        clearTimeout(timeout);
        origResolve(action);
      });
    });
  }

  handleEarlyFold(tableId: string): void {
    if (!this.zoomMode) return;

    // If hero's turn is active right now, resolve immediately as fold
    const resolve = this.pendingActions.get(tableId);
    if (resolve) {
      resolve({ type: 'fold', amount: 0 });
      this.pendingActions.delete(tableId);
      return;
    }

    // Otherwise mark for early fold when hero's turn arrives on this table
    this.earlyFoldTables.add(tableId);
  }

  /** Pick fresh bot names for zoom rerolling (allows reusing names across hands). */
  private pickFreshBotNames(count: number): string[] {
    const available = [...BOT_NAMES];
    const picked: string[] = [];
    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      picked.push(available.splice(idx, 1)[0]);
    }
    while (picked.length < count) picked.push(`Bot_${picked.length + 1}`);
    return picked;
  }

  private pickBotNames(count: number): string[] {
    const available = BOT_NAMES.filter(n => !this.usedBotNames.has(n));
    const picked: string[] = [];

    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      const name = available.splice(idx, 1)[0];
      picked.push(name);
      this.usedBotNames.add(name);
    }

    while (picked.length < count) {
      picked.push(`Bot_${this.usedBotNames.size + 1}`);
      this.usedBotNames.add(picked[picked.length - 1]);
    }

    return picked;
  }

  /**
   * Start a Spot Trainer session.
   * Creates N tables, each running the same postflop spot in a continuous drill loop.
   * No hand history is written; no zoom mode; no preflop betting.
   */
  startSpotSession(
    spotConfig: SpotConfig,
    heroSide: HeroSide,
    tableCount: number,
    playerName: string,
    apiClient: IPostflopApiClient,
    boards: string[]
  ): void {
    this.stopSession();
    this.usedBotNames.clear();
    this.tableIndexMap.clear();

    const { heroRef, villainRef } = getRangeRefs(spotConfig, heroSide);

    // Hero is always at seat 0 (bottom-center).
    // Villain seat is computed from position offsets so the table layout is spatially correct.
    // assignPositions() uses: offset = (seatIndex - buttonSeatIndex + 6) % 6
    // where POSITION_LABELS_6MAX = ['BTN','SB','BB','UTG','HJ','CO'] (offset 0–5).
    const humanSeatIndex = 0;
    const SEAT_OFFSET: Record<string, number> = { BTN: 0, SB: 1, BB: 2, UTG: 3, HJ: 4, CO: 5 };
    const heroPosition    = heroSide === 'IP' ? spotConfig.ipPosition  : spotConfig.oopPosition;
    const villainPosition = heroSide === 'IP' ? spotConfig.oopPosition : spotConfig.ipPosition;
    const heroPosOffset    = SEAT_OFFSET[heroPosition as string] ?? 0;
    const villainPosOffset = SEAT_OFFSET[villainPosition as string] ?? 0;
    // buttonSeatIndex is the seat that gets BTN label (offset 0).
    const buttonSeatIndex  = (6 - heroPosOffset) % 6;
    const villainSeatIndex = (villainPosOffset + buttonSeatIndex) % 6;
    const oopSeatIndex = heroSide === 'OOP' ? humanSeatIndex : villainSeatIndex;

    const potCents = Math.round(spotConfig.potBB * BB_CENTS);
    const effectiveStackCents = Math.round(spotConfig.effectiveStackBB * BB_CENTS);

    for (let i = 0; i < tableCount; i++) {
      const tableId = `spot-${i + 1}`;
      const tableName = `Spot Drill ${ROMAN[i] ?? (i + 1)}`;
      const villainName = this.pickBotNames(1)[0];
      // Place hero and villain at their computed seats; remaining seats sit out
      const playerNames: string[] = ['', '', '', '', '', ''];
      playerNames[humanSeatIndex] = playerName;
      playerNames[villainSeatIndex] = villainName;
      for (let s = 0; s < 6; s++) {
        if (s !== humanSeatIndex && s !== villainSeatIndex) playerNames[s] = `Bot${s + 1}`;
      }
      this.tableIndexMap.set(tableId, i);

      this.createTableWindow(tableId, tableName, i, tableCount);

      const actionProvider: ActionProvider = {
        getAction: async (handState, seatIndex, validActions) => {
          if (seatIndex === humanSeatIndex) {
            return this.waitForHumanAction(tableId, handState, validActions);
          }
          // Bot action — delegated to engine's spot betting round (uses API)
          // The PostflopBotController is used inside playSpotHand via the engine config
          // Here we provide a simple check/fold fallback (shouldn't be called in spot mode
          // for bots because runSpotBettingRound handles bot actions directly)
          return { type: 'check', amount: 0 };
        }
      };

      const engine = new GameEngine({
        tableId,
        humanSeatIndex,
        playerNames,
        actionProvider,
        charts: this.charts,
        revealBotCards: false,
        zoomMode: false,
        onSnapshot: (tid, snapshot) => {
          // Track available actions so timeout handler can use correct solverNodeId
          this.setCurrentUiActions(tid, snapshot.availableActions ?? null);
          const win = this.tableWindows.get(tid);
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.TABLE_STATE_UPDATE, snapshot);
          }
        },
        onSound: (tid, sound) => {
          const win = this.tableWindows.get(tid);
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.SOUND_TRIGGER, { sound, volume: 1.0, tableId: tid });
          }
        },
        onHandComplete: () => {
          // No hand history in spot mode
        },
        spotMode: {
          spotId: spotConfig.id,
          heroSide,
          getHoleCards: () => sampleSpotHands(this.charts, heroRef, villainRef),
          potCents,
          effectiveStackCents,
          villainSeatIndex,
          oopSeatIndex,
          chipToDollar: spotConfig.chipToDollar,
          apiClient,
          boards,
          buttonSeatIndex,
          onPostflopFeedback: (tid, feedback) => {
            const win = this.tableWindows.get(tid);
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC.POSTFLOP_FEEDBACK, feedback);
            }
          }
        }
      });

      this.engines.set(tableId, engine);
    }
  }
}
