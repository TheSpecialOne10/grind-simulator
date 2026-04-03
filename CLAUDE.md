# CLAUDE.md — Grind Simulator

## Project Overview

**Grind Simulator** is a desktop application that emulates the experience of multi-tabling online poker cash games on platforms like PokerStars or GGPoker. The player sits at 1–9 simultaneous 6-max No-Limit Hold'em tables ($0.50/$1.00 blinds, 100bb deep) against GTO-trained bots. Every aspect — visuals, sounds, timing, hand history — is designed to replicate a real-money online poker grind session.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop shell | **Electron** (latest stable) |
| Frontend | **React 18+ with TypeScript** |
| State management | **Zustand** (one store per table + one global store) |
| Styling | **CSS Modules** or **Tailwind CSS** |
| Build tool | **Vite** (with electron-vite or vite-plugin-electron) |
| Audio | **Howler.js** (pooled audio sprites) |
| IPC | Electron IPC (main ↔ renderer) |
| Solver data | PioSolver `.cfr` file parser (custom, runs in main process / worker) |
| Hand history | Plain text files, PokerStars format, written from main process |
| Packaging | **electron-builder** (Windows + macOS + Linux) |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   MAIN PROCESS                       │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Game Engine  │  │ Bot AI       │  │ Hand History│ │
│  │ (per table)  │  │ (preflop +   │  │ Writer     │ │
│  │              │  │  solver)     │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │         │
│  ┌──────┴─────────────────┴────────────────┴──────┐ │
│  │              Table Manager                      │ │
│  │  (orchestrates up to 9 tables, IPC dispatch)    │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │ IPC                            │
├─────────────────────┼────────────────────────────────┤
│                     │                                │
│              RENDERER PROCESS                        │
│                                                      │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │              App Shell                           │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │ │
│  │  │ Table 1 │ │ Table 2 │ │ Table N │  ...       │ │
│  │  │Component│ │Component│ │Component│           │ │
│  │  └─────────┘ └─────────┘ └─────────┘           │ │
│  │                                                  │ │
│  │  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Sound Manager│  │ Layout / Tiling Engine   │ │ │
│  │  └──────────────┘  └──────────────────────────┘ │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Process Separation

- **Main process**: Runs all game engines, bot AI, solver lookups, hand history I/O, and RNG. This is the source of truth for all game state. No game logic runs in the renderer.
- **Renderer process**: Purely presentational. Receives state snapshots via IPC, renders the UI, captures user input (fold/call/raise), and sends actions back via IPC.
- **Worker threads** (Node.js `worker_threads`): Used for CPU-heavy tasks — PioSolver `.cfr` file parsing and solver lookups. One shared worker pool for all tables.

---

## Directory Structure

```
grind-simulator/
├── CLAUDE.md                          # This file
├── package.json
├── electron-builder.yml
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
│
├── src/
│   ├── main/                          # Electron main process
│   │   ├── index.ts                   # Entry point, window creation, IPC setup
│   │   ├── ipc-handlers.ts            # All IPC channel handlers
│   │   ├── table-manager.ts           # Manages multiple table instances
│   │   │
│   │   ├── engine/                    # Poker game engine
│   │   │   ├── game-engine.ts         # Core game loop for one table
│   │   │   ├── deck.ts                # Deck, shuffle (Fisher-Yates), deal
│   │   │   ├── hand-evaluator.ts      # 7-card hand evaluation (fast lookup)
│   │   │   ├── pot-manager.ts         # Main pot + side pots
│   │   │   ├── betting-round.ts       # Manages a single betting round
│   │   │   ├── showdown.ts            # Showdown logic, winner determination
│   │   │   └── types.ts               # All poker type definitions
│   │   │
│   │   ├── bot/                       # Bot AI system
│   │   │   ├── bot-controller.ts      # Orchestrates bot decision-making
│   │   │   ├── preflop-charts.ts      # Complete 6-max preflop GTO ranges
│   │   │   ├── solver-bridge.ts       # Spawns & communicates with solver via UPI
│   │   │   ├── solver-lookup.ts       # Maps game state → UPI node ID → strategy
│   │   │   ├── upi-parser.ts          # Parses UPI responses (show_strategy, etc.)
│   │   │   ├── scenario-mapper.ts     # Maps preflop action to solver directory/file
│   │   │   ├── heuristic-fallback.ts  # Simplified postflop play when solver unavailable
│   │   │   ├── action-selector.ts     # Converts strategy frequencies to actions
│   │   │   └── timing.ts             # Realistic action delay (1-8s random)
│   │   │
│   │   ├── history/                   # Hand history system
│   │   │   ├── hand-history-writer.ts # Writes HH in PokerStars format
│   │   │   ├── pokerstars-format.ts   # PokerStars HH template/formatter
│   │   │   └── session-manager.ts     # Manages session files and naming
│   │   │
│   │   └── workers/                   # Worker threads
│   │       └── solver-queue-worker.ts # Queues solver requests across tables
│   │
│   ├── renderer/                      # React frontend
│   │   ├── index.html
│   │   ├── main.tsx                   # React entry point
│   │   ├── App.tsx                    # Root component, layout manager
│   │   │
│   │   ├── components/
│   │   │   ├── table/                 # Poker table components
│   │   │   │   ├── PokerTable.tsx     # Main table container (felt, rail)
│   │   │   │   ├── Seat.tsx           # Individual seat (avatar, name, stack)
│   │   │   │   ├── PlayerCards.tsx    # Hole cards display
│   │   │   │   ├── CommunityCards.tsx # Board cards (flop, turn, river)
│   │   │   │   ├── Pot.tsx            # Pot display (main + sides)
│   │   │   │   ├── DealerButton.tsx   # Dealer button chip
│   │   │   │   ├── ActionButtons.tsx  # Solver-driven action buttons (fold/check/call/bet/raise)
│   │   │   │   ├── FallbackSlider.tsx # Traditional slider (only when solver unavailable)
│   │   │   │   ├── Timer.tsx          # 30-second action timer (circular)
│   │   │   │   ├── ChipStack.tsx      # Animated chip stack in front of player
│   │   │   │   ├── WinnerOverlay.tsx  # Shows winning hand + pot awarded
│   │   │   │   └── CardComponent.tsx  # Single card (face/back, animated)
│   │   │   │
│   │   │   ├── lobby/                 # Pre-game setup
│   │   │   │   ├── Lobby.tsx          # Table count selector, start button
│   │   │   │   └── Settings.tsx       # Volume, HH path, solver path
│   │   │   │
│   │   │   └── hud/                   # Optional minimal HUD
│   │   │       └── MiniHud.tsx        # VPIP/PFR if desired (stretch goal)
│   │   │
│   │   ├── hooks/
│   │   │   ├── useTableState.ts       # Subscribe to table state via IPC
│   │   │   ├── useActionTimer.ts      # 30-second countdown hook
│   │   │   ├── useSound.ts            # Sound trigger hook
│   │   │   └── useWindowLayout.ts     # Window tiling calculations
│   │   │
│   │   ├── stores/
│   │   │   ├── global-store.ts        # Session-level state (tables open, settings)
│   │   │   └── table-store.ts         # Per-table UI state
│   │   │
│   │   ├── audio/
│   │   │   ├── sound-manager.ts       # Howler.js setup, audio sprite map
│   │   │   └── sounds/               # Audio files directory
│   │   │       ├── deal.mp3
│   │   │       ├── check.mp3
│   │   │       ├── bet.mp3
│   │   │       ├── call.mp3
│   │   │       ├── raise.mp3
│   │   │       ├── fold.mp3
│   │   │       ├── allin.mp3
│   │   │       ├── chips-collect.mp3
│   │   │       ├── card-flip.mp3
│   │   │       ├── timer-tick.mp3
│   │   │       ├── timer-warning.mp3
│   │   │       ├── your-turn.mp3
│   │   │       └── win.mp3
│   │   │
│   │   ├── assets/
│   │   │   ├── cards/                 # Card face images (52 cards + back)
│   │   │   │   ├── 2c.svg ... As.svg
│   │   │   │   └── back.svg
│   │   │   ├── chips/                 # Chip images by denomination
│   │   │   ├── avatars/              # 10+ bot avatar images
│   │   │   ├── table/                # Felt texture, rail texture
│   │   │   └── ui/                   # Dealer button, timer ring, etc.
│   │   │
│   │   └── styles/
│   │       ├── global.css             # CSS reset, variables, fonts
│   │       ├── table.module.css       # Table-specific styles
│   │       └── animations.css         # Card deal, chip slide, etc.
│   │
│   ├── shared/                        # Shared types between main & renderer
│   │   ├── ipc-channels.ts           # IPC channel name constants
│   │   ├── types.ts                  # Shared TypeScript interfaces
│   │   └── constants.ts              # Game constants (blinds, stack, etc.)
│   │
│   └── preload/
│       └── index.ts                   # Electron preload script (contextBridge)
│
├── data/
│   ├── solver/                        # PioSolver/JESolver .cfr files go here
│   │   ├── config.json                # Maps preflop scenarios → directories
│   │   └── README.md                  # Instructions for adding solver files
│   └── hand-histories/               # Generated HH files saved here
│
├── scripts/
│   └── generate-card-svgs.ts         # Script to generate card SVG assets
│
└── tests/
    ├── engine/
    │   ├── game-engine.test.ts
    │   ├── hand-evaluator.test.ts
    │   ├── pot-manager.test.ts
    │   └── deck.test.ts
    ├── bot/
    │   ├── preflop-charts.test.ts
    │   ├── action-selector.test.ts
    │   ├── solver-bridge.test.ts
    │   ├── node-id-builder.test.ts
    │   └── scenario-mapper.test.ts
    └── history/
        └── pokerstars-format.test.ts
```

---

## Module Specifications

### 1. Game Engine (`src/main/engine/`)

The game engine is the heart of the application. One instance runs per active table in the main process.

#### `types.ts` — Core Type Definitions

```typescript
type Suit = 'c' | 'd' | 'h' | 's';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

interface Card {
  rank: Rank;
  suit: Suit;
}

type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'MP' | 'CO';

// Seat indices 0-5 map to physical seat positions at a 6-max table.
// Position labels rotate with the button.

interface Player {
  seatIndex: number;        // 0–5, fixed physical seat
  name: string;             // Display name
  stack: number;            // Current stack in dollars (cents internally)
  holeCards: [Card, Card] | null;
  isHuman: boolean;
  isActive: boolean;        // Still in the hand
  isSittingOut: boolean;
  currentBet: number;       // Bet placed in current betting round
  hasActed: boolean;        // Has acted this betting round
  position: Position;       // Current position label
}

type Street = 'preflop' | 'flop' | 'turn' | 'river';

type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'post_sb' | 'post_bb';

interface Action {
  playerSeatIndex: number;
  type: ActionType;
  amount: number;           // In dollars. 0 for fold/check.
  timestamp: number;
}

interface HandState {
  handId: string;           // Unique hand ID (incrementing per session)
  tableId: string;          // Table identifier
  buttonSeatIndex: number;  // Which seat has the dealer button
  players: Player[];        // All 6 players
  deck: Card[];             // Shuffled deck (consumed as dealt)
  communityCards: Card[];   // 0–5 cards
  street: Street;
  pot: number;              // Total pot
  sidePots: SidePot[];
  actions: Action[];        // Full action history for this hand
  currentPlayerIndex: number; // Seat index of player to act
  minRaise: number;         // Minimum legal raise TO amount
  isComplete: boolean;
}

interface SidePot {
  amount: number;
  eligiblePlayers: number[]; // Seat indices
}

// Snapshot sent to renderer (hides bot hole cards)
interface TableSnapshot {
  handId: string;
  tableId: string;
  players: PlayerSnapshot[];   // Bot cards hidden unless showdown
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  street: Street;
  currentPlayerIndex: number;
  buttonSeatIndex: number;
  isHandComplete: boolean;
  lastAction: Action | null;
  winnerInfo: WinnerInfo[] | null;
  timeRemaining: number;       // Seconds left for current actor
  availableActions: AvailableAction[] | null; // Solver-driven actions for human, null when not human's turn
}

interface AvailableAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount: number;              // Dollar amount (0 for fold/check)
  solverNodeId: string;        // UPI node ID of this child — passed back with player action
  label: string;               // Display label: "Bet $3.67 (33%)" or "Raise $16.50 (75%)"
}

interface PlayerSnapshot {
  seatIndex: number;
  name: string;
  stack: number;
  holeCards: [Card, Card] | null;  // null for bots unless showdown
  isActive: boolean;
  currentBet: number;
  position: Position;
  isCurrentActor: boolean;
}

interface WinnerInfo {
  seatIndex: number;
  amount: number;
  handDescription: string;    // e.g., "Two Pair, Aces and Kings"
  cards: [Card, Card];
}
```

#### `deck.ts` — Deck & Shuffle

- Standard 52-card deck.
- **Fisher-Yates shuffle** using `crypto.getRandomValues()` for cryptographic-quality randomness.
- `deal(n)`: Remove and return `n` cards from top.
- `burn()`: Remove 1 card (burn before flop/turn/river).

#### `game-engine.ts` — Main Game Loop

One `GameEngine` instance per table. It runs an async loop:

```
1. Start new hand
   a. Reset all stacks to 100bb ($100.00)
   b. Rotate button clockwise to next seat
   c. Shuffle deck
   d. Post blinds (SB = $0.50, BB = $1.00)
   e. Deal 2 hole cards to each player
   f. Emit state snapshot to renderer

2. Preflop betting round
   a. Action starts UTG (seat after BB)
   b. For each player in turn:
      - If human: emit snapshot, wait for IPC action (30s timeout → auto-fold)
      - If bot: query BotController for action (with 1-8s delay)
      - Validate action legality
      - Apply action to state
      - Emit updated snapshot
   c. Continue until betting round complete (all active players matched or folded)
   d. If only 1 player remains → award pot, skip to step 6

3. Flop
   a. Burn 1, deal 3 community cards
   b. Emit snapshot (with card-deal animation trigger)
   c. Betting round (action starts first active player left of button)
   d. If only 1 player remains → award pot, skip to step 6

4. Turn
   a. Burn 1, deal 1 community card
   b. Emit snapshot
   c. Betting round
   d. If only 1 player remains → award pot, skip to step 6

5. River
   a. Burn 1, deal 1 community card
   b. Emit snapshot
   c. Betting round
   d. If only 1 player remains → award pot, skip to step 6

6. Showdown (if 2+ players remain)
   a. Evaluate all remaining hands (7-card evaluation)
   b. Determine winner(s), split pots if tied
   c. Emit showdown snapshot (reveal bot cards)
   d. Award pot(s)

7. End of hand
   a. Write hand history to disk (PokerStars format)
   b. Emit hand-complete snapshot with winner animation data
   c. Wait 2-3 seconds (pause between hands)
   d. Go to step 1
```

#### `hand-evaluator.ts` — Hand Evaluation

Use a fast lookup-table based evaluator. Recommended approach:

- Port or use a JavaScript implementation of the **Two Plus Two evaluator** or **Cactus Kev's** algorithm.
- Must evaluate 7-card hands (2 hole + 5 community) to a numeric rank.
- Lower rank = better hand.
- Must also produce a human-readable hand description ("Pair of Aces", "Straight, King high", etc.) for showdown display and hand history.

Performance target: <1ms per evaluation (will be called many times per hand for multi-way pots).

#### `pot-manager.ts` — Pot Calculation

- Track bets per player per street.
- After each street, calculate main pot and side pots for all-in situations.
- At showdown, award each pot to the best hand among eligible players.
- Handle split pots (identical hand rank) by dividing evenly (odd chip to earliest position).

#### `betting-round.ts` — Betting Round Logic

Manages a single betting round (preflop/flop/turn/river):

- Tracks who has acted, current bet to match, minimum raise size.
- **Minimum raise rule**: The minimum raise must be at least the size of the previous raise. If a player raises from $1 to $3 (a raise of $2), the next raise must be to at least $5.
- **All-in**: A player can always go all-in for their remaining stack, even if it's less than the minimum raise. A short all-in does NOT reopen betting to players who have already acted (unless it's a full raise).
- Betting round ends when all active players have acted and all bets are matched, OR only one player remains.
- Preflop: BB has option to check/raise if action limps around.

---

### 2. Bot AI System (`src/main/bot/`)

#### `bot-controller.ts` — Decision Orchestrator

```typescript
interface BotDecision {
  action: ActionType;
  amount: number;        // 0 for fold/check, bet/raise amount in dollars
  delay: number;         // Milliseconds to wait before acting (1000-8000)
}

class BotController {
  // Given the current hand state and bot's seat index, return a decision
  async getAction(handState: HandState, seatIndex: number): Promise<BotDecision>;
}
```

**Decision flow:**
1. Determine the street (preflop or postflop).
2. **Preflop**: Look up preflop chart for the bot's position and hole cards → get action frequencies (e.g., raise 70%, call 20%, fold 10%) → randomly select action weighted by frequencies.
3. **Postflop**: Look up PioSolver data for the current game tree node → get strategy vector → randomly select action weighted by frequencies.
4. If solver data not found for this node: fall back to simplified heuristic.
5. Calculate a realistic delay (random 1–8 seconds, weighted toward 2–4s).

#### `preflop-charts.ts` — GTO Preflop Ranges

Hardcoded 6-max GTO preflop charts. Each position (UTG, MP, CO, BTN, SB, BB) has a chart for each possible game state:

**Scenarios to cover (RFI = raise first in):**
- **RFI (open raise)**: Action folds to this player. Chart: {hand → raise% / fold%}
- **vs RFI (facing a single raise)**: Each position vs each opener position. Chart: {hand → 3bet% / call% / fold%}
- **vs 3-bet**: Original raiser faces a 3-bet. Chart: {hand → 4bet% / call% / fold%}
- **vs 4-bet**: 3-bettor faces a 4-bet. Chart: {hand → 5bet(allin)% / call% / fold%}
- **Limp pots**: SB vs BB after limps (simplified).

**Hand representation**: Use canonical form — e.g., `AKs`, `AKo`, `AA`. 169 unique combos. Each mapped to action frequencies.

**Data structure:**
```typescript
// For each scenario, a map of hand → action probabilities
type HandRange = Record<string, ActionFrequency>;

interface ActionFrequency {
  fold?: number;    // probability 0–1
  call?: number;
  raise?: number;   // or "3bet" / "4bet" contextually
  allIn?: number;
}

// Organized by position and scenario
const PREFLOP_CHARTS: Record<Position, Record<string, HandRange>> = {
  UTG: {
    rfi: { 'AA': { raise: 1.0 }, 'AKs': { raise: 1.0 }, ... },
    vs_rfi_MP: { ... },
    // etc.
  },
  // ...
};
```

**Raise sizing (preflop):**
- Open raise (RFI): 2.5bb from all positions (some variation acceptable)
- 3-bet: ~3x the open raise from IP, ~3.5x from OOP
- 4-bet: ~2.3x the 3-bet
- 5-bet: All-in

#### `action-selector.ts` — Weighted Random Selection

Given an `ActionFrequency` object (e.g., `{fold: 0.3, call: 0.5, raise: 0.2}`), select an action randomly weighted by the probabilities. Use `crypto.getRandomValues()` for the random number.

#### Solver Integration — UPI Protocol (PioSolver / JESolver)

Both PioSolver and JESolver implement the **UPI (Universal Poker Interface)** protocol, inspired by UCI for chess engines. JESolver was built on PioSolver's UPI architecture and is command-compatible. The Grind Simulator communicates with the solver as a **child process via stdin/stdout**, or optionally connects to JESolver running as a **TCP server** (default port 5251).

##### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│               MAIN PROCESS                       │
│                                                  │
│  ┌──────────────┐     ┌───────────────────────┐ │
│  │ Game Engine   │────▶│ Solver Bridge          │ │
│  │ (needs action │     │                       │ │
│  │  for bot)     │◀────│ • Spawns solver proc  │ │
│  └──────────────┘     │ • Sends UPI commands  │ │
│                        │ • Parses responses    │ │
│                        │ • Caches loaded trees │ │
│                        └──────────┬────────────┘ │
│                                   │ stdin/stdout │
│                        ┌──────────▼────────────┐ │
│                        │ jesolver.exe /         │ │
│                        │ PioSOLVER-edge.exe     │ │
│                        │ (child process)        │ │
│                        └───────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Two solver modes** (configurable in settings):

1. **Child process mode** (default): Spawn `jesolver.exe` or `PioSOLVER-edge.exe` as a child process. Communicate via stdin/stdout pipes. Works on Windows, macOS (JESolver), and Linux (JESolver).
2. **Server mode** (JESolver only): Connect to a running JESolver TCP server via the `connect` command. Useful for remote high-RAM machines. Default port 5251.

##### UPI Communication Protocol

The solver communicates via text-based stdin/stdout. Key protocol rules:

1. **Commands are single lines** sent to the solver's stdin.
2. **Responses** can be one or more lines. Use `set_end_string END` at startup so every response is terminated with `END` on its own line.
3. **Lines starting with `#`** and empty lines are ignored (can be used for comments).
4. **SOLVER: blocks**: When the solver is running (after `go`), it emits progress updates starting with `SOLVER:` and ending with `END`. These must be consumed and not confused with command responses.
5. **Startup banner**: The solver prints version info on startup. Send `set_end_string END` first, then `is_ready` and wait for `is_ready ok!\nEND` before sending further commands.

##### `solver-bridge.ts` — Solver Process Manager

```typescript
class SolverBridge {
  private process: ChildProcess | null;
  private responseQueue: Array<{ resolve: Function; reject: Function }>;
  private buffer: string;
  private endString: string = 'END';
  private loadedTreePath: string | null = null;

  // Lifecycle
  async start(solverPath: string): Promise<void>;       // Spawn child process
  async startServer(host: string, port: number): Promise<void>; // Connect to TCP server
  async shutdown(): Promise<void>;                        // Send 'exit', kill process

  // Low-level UPI command
  async sendCommand(command: string): Promise<string>;    // Send command, return full response text

  // High-level API
  async loadTree(cfrFilePath: string): Promise<void>;
  async getStrategy(nodeId: string): Promise<number[][]>; // Returns N arrays of 1326 floats
  async getChildren(nodeId: string): Promise<NodeInfo[]>;
  async getRange(position: 'OOP' | 'IP', nodeId: string): Promise<number[]>;
  async getHandOrder(): Promise<string[]>;                // Cache this — always the same 1326 hands
  async isTreePresent(): Promise<boolean>;
  async freeTree(): Promise<void>;
  async getNodeInfo(nodeId: string): Promise<NodeInfo>;
}
```

**Startup sequence:**
```typescript
async start(solverPath: string) {
  this.process = spawn(solverPath); // e.g. 'jesolver.exe' or 'PioSOLVER-edge.exe'

  // Pipe stdout through line parser
  this.process.stdout.on('data', (chunk) => this.onData(chunk));

  // Wait for startup banner to finish, then initialize
  await this.sendCommand('set_end_string END');
  await this.sendCommand('is_ready');  // Expect: "is_ready ok!\nEND"

  // Cache the hand order (constant, never changes)
  this.handOrder = await this.getHandOrder();

  // Set threads based on available CPUs (leave 2 for main process + renderer)
  const threads = Math.max(1, os.cpus().length - 2);
  await this.sendCommand(`set_threads ${threads}`);
}
```

**Response parsing:**
```typescript
// Buffer incoming data, split on END marker
onData(chunk: Buffer) {
  this.buffer += chunk.toString();

  while (true) {
    // Check for SOLVER: progress blocks — consume and discard
    const solverMatch = this.buffer.match(/^SOLVER:[\s\S]*?END\n/);
    if (solverMatch) {
      this.buffer = this.buffer.slice(solverMatch[0].length);
      continue;
    }

    // Check for command response ending with END
    const endIndex = this.buffer.indexOf('\nEND\n');
    if (endIndex === -1) break;

    const response = this.buffer.slice(0, endIndex);
    this.buffer = this.buffer.slice(endIndex + 5); // Skip past \nEND\n

    // Resolve the oldest pending promise
    const pending = this.responseQueue.shift();
    if (pending) pending.resolve(response.trim());
  }
}
```

##### UPI Node ID Format — Mapping Game State to Tree Nodes

This is the **most critical piece** of solver integration. Every node in a PioSolver/JESolver tree is identified by a **node ID string** that encodes the action history:

**Format:** `r:0:action1:action2:card:action3:...`

- `r` = root node
- `r:0` = first decision node (always the starting point for queries)
- `c` = check or call
- `b{N}` = bet or raise **to** N chips (cumulative amount invested, NOT the raise increment)
- `f` = fold
- Board cards appear in the path when a new street is dealt: e.g., `r:0:b6:c:Qs7h2d:c:b15` means: raise to 6, call, flop is Qs7h2d, check, bet to 15.
- Turn/river cards appear individually: `...Qs7h2d:c:c:5h:b30` = flop Qs7h2d, check-check, turn 5h, bet to 30.

**Mapping from Grind Simulator actions to UPI node IDs:**

```typescript
function buildNodeId(handState: HandState): string {
  let nodeId = 'r:0';

  for (const action of handState.postflopActions) {
    switch (action.type) {
      case 'check':
        nodeId += ':c';
        break;
      case 'call':
        nodeId += ':c';
        break;
      case 'fold':
        // Folds end the line — we don't query strategy at fold nodes
        break;
      case 'bet':
      case 'raise':
        // CRITICAL: amount is CUMULATIVE total invested by this player in the hand
        // Convert from dollars to chips (the tree's unit)
        const cumChips = dollarsToCfrChips(action.cumulativeAmount);
        nodeId += `:b${cumChips}`;
        break;
    }

    // Insert board cards when a new street begins
    if (action.dealtCards) {
      if (action.dealtCards.length === 3) {
        // Flop: insert as single string e.g. "Qs7h2d"
        nodeId += ':' + action.dealtCards.map(cardToString).join('');
      } else {
        // Turn/river: single card e.g. "5h"
        nodeId += ':' + cardToString(action.dealtCards[0]);
      }
    }
  }

  return nodeId;
}
```

**IMPORTANT — Chip scaling:** PioSolver trees use chip units defined at tree creation time. The `.cfr` file's `set_pot` and `set_eff_stack` values determine the scale. You MUST read these from the tree metadata and compute a conversion factor between the tree's chip units and Grind Simulator's dollar amounts. For example, if the tree was built with `set_pot 0 0 6` (6-chip pot, i.e., 3bb each in a single-raised pot) and `set_eff_stack 200` (200 chips = 100bb), then 1 chip = $0.50 (1bb = 2 chips at $0.50/$1.00).

##### `solver-lookup.ts` — Strategy Retrieval

```typescript
class SolverLookup {
  private bridge: SolverBridge;
  private handOrder: string[];          // Cached 1326-hand order
  private handIndexMap: Map<string, number>; // "AhKd" → index in 1326 array
  private treeCache: LRUCache<string, boolean>; // Track which .cfr files are loaded

  /**
   * Get the bot's action given the current game state.
   * Returns action frequencies for each available action.
   */
  async getStrategy(
    cfrFilePath: string,
    nodeId: string,
    botHoleCards: [Card, Card]
  ): Promise<{ action: string; frequency: number }[]> {

    // 1. Load the tree if not already loaded
    if (this.treeCache.get(cfrFilePath) !== true) {
      await this.bridge.freeTree();
      await this.bridge.sendCommand(`load_tree "${cfrFilePath}"`);
      this.treeCache.set(cfrFilePath, true);
    }

    // 2. Get available actions at this node
    const children = await this.bridge.getChildren(nodeId);
    // children returns info like:
    // child 0: nodeId=r:0:c  (check)
    // child 1: nodeId=r:0:b15 (bet 15)
    // child 2: nodeId=r:0:b45 (bet 45)

    // 3. Get strategy: returns N lines of 1326 floats
    //    Line i = frequency of taking action i for each hand
    const strategyResponse = await this.bridge.sendCommand(`show_strategy ${nodeId}`);
    const strategyLines = strategyResponse.trim().split('\n');

    // 4. Find the bot's hand index in the 1326-hand order
    const handKey = cardPairToHandKey(botHoleCards); // e.g., "AhKd"
    const handIndex = this.handIndexMap.get(handKey);

    // 5. Extract frequencies for this specific hand
    const actionFrequencies = strategyLines.map((line, i) => {
      const values = line.trim().split(/\s+/).map(Number);
      return {
        action: this.parseChildAction(children[i]),
        frequency: values[handIndex]
      };
    });

    return actionFrequencies;
  }
}
```

**The `show_hand_order` mapping:**
The solver returns 1326 hands in a fixed order (all C(52,2) two-card combos). Call `show_hand_order` once at startup and cache the result. The response looks like: `2d2c 2h2c 2h2d 2s2c 2s2d 2s2h 3c2c 3c2d ...`. Build a map from hand string → index for fast lookup.

```typescript
// Call once at startup
async cacheHandOrder() {
  const response = await this.bridge.sendCommand('show_hand_order');
  this.handOrder = response.trim().split(/\s+/);
  this.handIndexMap = new Map();
  this.handOrder.forEach((hand, i) => {
    this.handIndexMap.set(hand, i);
    // Also store reverse order (e.g., "KdAh" maps to same index as "AhKd")
    const reversed = hand.slice(2) + hand.slice(0, 2);
    this.handIndexMap.set(reversed, i);
  });
}
```

##### `show_strategy` Response Format

The response to `show_strategy <nodeId>` is N lines (one per available child action), each containing 1326 space-separated floats. The float at position `i` in line `j` represents the probability that hand `i` (in `show_hand_order` order) takes action `j`.

**Example:** At a node with 3 children (check, bet 33%, bet 75%):
```
0.0 0.0 0.45 0.45 0.8 ...   (1326 floats — frequency of check for each hand)
0.0 0.0 0.30 0.30 0.1 ...   (1326 floats — frequency of bet 33% for each hand)
0.0 0.0 0.25 0.25 0.1 ...   (1326 floats — frequency of bet 75% for each hand)
```

Frequencies for each hand sum to 1.0 across all action lines. Dead hands (impossible given the board) have 0.0 for all actions.

##### `show_children` Response Format

```
child 0:
r:0:c
PLAYER_NODE          (or CHANCE_NODE, END_NODE, etc.)
Qs7h2d               (board)
15 15 6              (pot: OOP invested, IP invested, dead money)
3 children
flags:

child 1:
r:0:b15
PLAYER_NODE
...
```

Parse each child to extract: the node ID (which encodes the action taken), the node type, and the pot amounts. The action is inferred from the node ID suffix: `:c` = check/call, `:b{N}` = bet/raise to N, fold nodes appear as END_NODE children.

##### Solver-Driven Action Buttons (Human Player)

**Design principle:** The human player can ONLY choose bet/raise sizes that exist in the pre-computed solver tree. This eliminates bet size mismatch entirely and keeps the entire hand within the solver's game tree, so bots always have a proper solver response.

**How it works:**

1. When it's the human player's turn to act, the game engine queries `show_children` on the current node ID to discover all available actions in the solver tree.
2. These available actions are sent to the renderer as part of the `TableSnapshot`.
3. The renderer displays **only the actions that exist in the tree** as clickable buttons.

**Example — human is IP on the flop, pot is $11, facing a check:**
The solver tree at this node has children: `check`, `bet to 4 chips` (≈$2), `bet to 8 chips` (≈$4), `bet to 11 chips` (≈$5.50). The UI shows:

```
[ CHECK ]  [ BET $2.00 ]  [ BET $4.00 ]  [ BET $5.50 ]
```

**Example — human faces a bet of $7 on the turn:**
The solver tree children are: `fold`, `call`, `raise to 22 chips` (≈$11), `raise to 50 chips` (≈$25). The UI shows:

```
[ FOLD ]  [ CALL $7.00 ]  [ RAISE $11.00 ]  [ RAISE $25.00 ]
```

**No slider, no manual input.** The traditional bet slider and text input are replaced by discrete action buttons derived from the solver tree. This is simpler to implement and guarantees tree consistency.

**Implementation:**

```typescript
interface AvailableAction {
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount: number;           // Dollar amount (0 for fold/check)
  nodeId: string;           // The UPI node ID for this child (used to continue navigation)
  label: string;            // Display label, e.g. "Raise to $11.00" or "Bet 33% pot"
}

// In solver-lookup.ts
async getAvailableActions(
  currentNodeId: string,
  chipToDollar: number
): Promise<AvailableAction[]> {
  const childrenResponse = await this.bridge.sendCommand(`show_children ${currentNodeId}`);
  const children = this.parseChildren(childrenResponse);

  return children.map(child => {
    const suffix = child.nodeId.split(':').pop(); // e.g., 'c', 'b15', 'f'

    if (suffix === 'c') {
      // Determine if check or call based on context
      // Check: if no outstanding bet. Call: if there is a bet to match.
      return { type: needsToCall ? 'call' : 'check', amount: callAmount, nodeId: child.nodeId, label: ... };
    } else if (suffix?.startsWith('b')) {
      const chipAmount = parseInt(suffix.slice(1));
      const dollarAmount = chipAmount * chipToDollar;
      const isRaise = /* context: is there an outstanding bet? */;
      return { type: isRaise ? 'raise' : 'bet', amount: dollarAmount, nodeId: child.nodeId, label: ... };
    }
    // Fold is always implicitly available (END_NODE child)
    return { type: 'fold', amount: 0, nodeId: child.nodeId, label: 'Fold' };
  });
}
```

**Button styling:** Display bet/raise amounts both as absolute dollars AND as a percentage of pot for clarity: e.g., `BET $3.67 (33%)`, `RAISE $16.50 (75%)`.

**Fallback when solver tree is not loaded:** If no solver data is available (no `.cfr` file for this spot), fall back to the traditional UI with a slider showing standard bet sizes: 33% pot, 50% pot, 67% pot, 75% pot, 100% pot, all-in. In this fallback mode, bots use the heuristic postflop strategy.

**IPC flow for available actions:**
```typescript
// TableSnapshot now includes available actions
interface TableSnapshot {
  // ... existing fields ...
  availableActions: AvailableAction[] | null;  // null when not human's turn
}

// Human clicks a button → sends the chosen action's nodeId back
interface PlayerActionMessage {
  tableId: string;
  action: ActionType;
  amount: number;
  solverNodeId: string;   // The node ID of the child chosen — used directly for tree navigation
}
```

This means after the human acts, the game engine doesn't need to re-derive the node ID — it simply uses the `solverNodeId` from the player's action message as the new current node. This is robust and avoids any conversion errors.

##### Solver Data File Organization

Pre-solved `.cfr` files are organized by preflop scenario and board. Each file contains the full postflop game tree for that specific flop, given the preflop action that created the pot.

**Expected directory structure:**
```
data/solver/
├── config.json                  # Maps preflop scenarios to directories
│
├── SRP_EP_vs_BB/                # Single Raised Pot: EP open, BB call
│   ├── Ah Kd Qs.cfr            # Specific flop (filename = board)
│   ├── Ks Td 7c.cfr
│   ├── ...
│
├── SRP_CO_vs_BB/                # SRP: CO open, BB call
│   ├── ...
│
├── SRP_BTN_vs_BB/               # SRP: BTN open, BB call
│   ├── ...
│
├── SRP_SB_vs_BB/                # SRP: SB open, BB call
│   ├── ...
│
├── 3BET_BB_vs_BTN/              # 3-bet pot: BTN opens, BB 3-bets, BTN calls
│   ├── ...
│
├── 3BET_BB_vs_CO/               # 3-bet pot: CO opens, BB 3-bets, CO calls
│   ├── ...
│
├── 4BET_BTN_vs_BB/              # 4-bet pot: BB 3-bets, BTN 4-bets, BB calls
│   ├── ...
│
└── README.md                    # Instructions for users
```

**`config.json`** maps the preflop action sequence (as observed in the game) to the correct directory:

```json
{
  "scenarios": {
    "SRP_EP_vs_BB": {
      "description": "EP opens 2.5bb, BB calls",
      "dir": "SRP_EP_vs_BB",
      "preflop_pot": 5.5,
      "effective_stack": 97.5,
      "tree_pot_chips": 11,
      "tree_eff_stack_chips": 195,
      "chip_to_bb": 0.5,
      "oop_player": "BB",
      "ip_player": "EP"
    },
    "SRP_BTN_vs_BB": {
      "description": "BTN opens 2.5bb, BB calls",
      "dir": "SRP_BTN_vs_BB",
      "preflop_pot": 5.5,
      "effective_stack": 97.5,
      "tree_pot_chips": 11,
      "tree_eff_stack_chips": 195,
      "chip_to_bb": 0.5,
      "oop_player": "BB",
      "ip_player": "BTN"
    }
  }
}
```

**File naming for boards:** The `.cfr` filename is the flop cards concatenated, e.g., `AhKdQs.cfr`. When looking up a specific flop, construct the filename from the dealt community cards. If the exact flop file doesn't exist (user doesn't have that many sims), fall back to heuristic play.

##### Solver Lookup Flow — Complete Sequence

When a bot needs to act postflop:

```
1. Determine the preflop scenario (who opened, who called/3bet, etc.)
2. Map to a config.json scenario key → get directory and chip scaling
3. Construct the .cfr filename from the flop cards
4. Check if file exists in solver directory
   ├── YES: Proceed with solver lookup
   └── NO: Fall back to heuristic play

5. Load the .cfr file if not already loaded:
   await bridge.sendCommand(`load_tree "${filePath}"`)

6. Get the current UPI node ID:
   - If it's the bot's first action on this street: build from action history
   - If continuing from a human action: use the solverNodeId passed back by
     the renderer (which came from show_children — always exact)

7. Get strategy at node:
   await bridge.sendCommand(`show_strategy ${nodeId}`)
   → Parse N lines of 1326 floats

8. Look up bot's specific hand in the 1326-hand array:
   handIndex = handIndexMap.get("AhKd")
   frequencies = strategyLines.map(line => line[handIndex])

9. Select action using weighted random from frequencies
10. Convert tree chip amounts back to dollar amounts
11. Return BotDecision { action, amount, delay }
```

**Note:** Because the human player can ONLY choose actions that exist in the solver tree (via solver-driven action buttons), there is never a bet size mismatch. Every node the game visits is guaranteed to exist in the loaded `.cfr` tree. The `solverNodeId` passed back from the renderer after a human action can be used directly — no validation or snapping needed.

When it's the human's turn:

```
1. Same steps 1-5 as above (ensure tree is loaded)
2. Get the current UPI node ID
3. Query available actions:
   await bridge.sendCommand(`show_children ${nodeId}`)
   → Parse child nodes into AvailableAction[] with dollar amounts + labels
4. Include AvailableAction[] in the TableSnapshot sent to renderer
5. Renderer displays discrete action buttons
6. Human clicks one → solverNodeId is sent back → becomes new current node
```

##### JESolver-Specific Features

JESolver extends PioSolver's UPI with useful additional commands:

- **`set_compression <level>`**: Controls memory/speed tradeoff. Levels: `auto`, `none`, `low`, `medium`, `high`, `max`, `fast` (default). Use `auto` to let JESolver choose the best compression for available RAM.
- **`enable_progress_bar 0`**: Disable progress bar output (cleaner stdout for parsing).
- **`set_ev_boost <nodeId> <boost>`**: Artificially adjust EV to create exploitative tendencies (future feature: different bot profiles).
- **Server mode**: Run JESolver with `--server --port 5251` on a remote machine. Connect from the app with `connect <hostname> [port]`.
- **`eval_hand <cards>`**: Built-in hand evaluator for debugging.
- **`show_range_grid <position>`**: ASCII range visualization for debugging.
- **`show_stats`**: Detailed tree statistics.
- **`set_deck_distribution <52 probs>`**: Model bunching effect in multi-handed game (advanced feature for future realism).

##### Performance Considerations

- **Tree loading**: Loading a large `.cfr` file can take 2–30 seconds depending on tree size and disk speed. Use `load_tree` with the `fast` option when available (keeps file open, reads on demand).
- **Strategy queries**: `show_strategy` on a loaded tree takes <10ms for postflop nodes. This is fast enough for real-time bot play.
- **Memory**: A single postflop tree can use 500MB–8GB of RAM. For multi-table play, we likely can only keep 1–2 trees loaded at once. Implement an **LRU tree cache**: when a new tree is needed and memory is tight, `free_tree` the least recently used one.
- **Solver process count**: Spawn **one solver process** shared across all tables. Queue strategy requests and process them sequentially. Bot timing delays (1–8 seconds) give ample time for lookups.
- **Preloading**: When a hand starts and we know the preflop scenario, start loading the relevant `.cfr` file in the background during the preflop betting round, before the flop is even dealt. This hides load latency.

##### Fallback Heuristic — When Solver Data is Unavailable

If no `.cfr` file covers the current spot, use a simplified heuristic:

- **Hand strength**: Calculate hand equity vs a random range using a simplified method.
- **Strong hands (top 20% equity)**: Bet/raise with high frequency.
- **Medium hands (20–50%)**: Check/call.
- **Weak hands (bottom 50%)**: Check/fold.
- **Draw considerations**: Weight toward betting/calling with flush/straight draws.

This heuristic is a fallback only — the goal is to have comprehensive solver coverage.

#### `timing.ts` — Realistic Bot Timing

Bots must NOT act instantly — that breaks immersion.

**Delay distribution:**
- Generate delay from a log-normal distribution centered around 3 seconds.
- Range: 1–8 seconds.
- Simple decisions (obvious fold with trash hand) → shorter delay (1–3s).
- Complex decisions (close spots, big pots) → longer delay (4–8s).
- Preflop folds → 1–2 seconds.
- Postflop actions → 2–6 seconds.
- All-in decisions → 4–8 seconds.

**Implementation:**
```typescript
function getBotDelay(context: { street: Street; potSize: number; isAllIn: boolean; actionType: ActionType }): number {
  // Base delay from log-normal distribution
  // Adjust based on context
  // Return milliseconds
}
```

---

### 3. Hand History Writer (`src/main/history/`)

#### `pokerstars-format.ts` — PokerStars Hand History Format

Every hand is saved in the exact PokerStars text format so it can be imported into tracking software (PokerTracker 4, Hand2Note, etc.).

**Exact format template:**

```
PokerStars Hand #HANDID: Hold'em No Limit ($0.50/$1.00 USD) - YYYY/MM/DD HH:MM:SS ET
Table 'TABLENAME' 6-max Seat #BUTTONSEAT is the button
Seat 1: PLAYER1 ($100.00 in chips)
Seat 2: PLAYER2 ($100.00 in chips)
Seat 3: PLAYER3 ($100.00 in chips)
Seat 4: PLAYER4 ($100.00 in chips)
Seat 5: PLAYER5 ($100.00 in chips)
Seat 6: PLAYER6 ($100.00 in chips)
SBPLAYER: posts small blind $0.50
BBPLAYER: posts big blind $1.00
*** HOLE CARDS ***
Dealt to HUMANPLAYER [Ah Kd]
UTGPLAYER: folds
MPPLAYER: raises $2.50 to $3.50
COPLAYER: folds
BTNPLAYER: calls $3.50
SBPLAYER: folds
BBPLAYER: folds
*** FLOP *** [Qh Td 3c]
MPPLAYER: bets $4.50
BTNPLAYER: calls $4.50
*** TURN *** [Qh Td 3c] [Jh]
MPPLAYER: checks
BTNPLAYER: bets $12.00
MPPLAYER: calls $12.00
*** RIVER *** [Qh Td 3c Jh] [2s]
MPPLAYER: checks
BTNPLAYER: bets $25.00
MPPLAYER: folds
Uncalled bet ($25.00) returned to BTNPLAYER
BTNPLAYER collected $41.00 from pot
*** SUMMARY ***
Total pot $41.00 | Rake $0.00
Board [Qh Td 3c Jh 2s]
Seat 1: PLAYER1 (button) folded before Flop
Seat 2: PLAYER2 (small blind) folded before Flop
Seat 3: PLAYER3 (big blind) folded before Flop
Seat 4: PLAYER4 folded before Flop
Seat 5: PLAYER5 lost
Seat 6: PLAYER6 collected ($41.00)


```

**Key details:**
- No rake. Always `Rake $0.00`.
- Hand IDs are sequential integers starting from 1 per session.
- Table names: `"Grind Sim I"`, `"Grind Sim II"`, etc. (use Roman numerals).
- Timestamps are real wall-clock time in ET timezone.
- Cards use rank + suit lowercase: `Ah`, `Kd`, `Tc`, `2s`.
- Dollar amounts always show 2 decimal places.
- Two blank lines between hands in the file.
- The human player's name should be configurable in settings (default: `"Hero"`).
- Bot names: Generate from a pool of realistic poker screen names (e.g., `"xXPokerProXx"`, `"fish2024"`, `"AceHunter"`, `"NitNation"`, `"RunItTwice"`, `"3betBluff"`, etc.). Assign 5 unique names per table, persistent for the session.
- **File naming**: `HH_GrindSim_TABLENAME_YYYYMMDD_HHMMSS.txt` (one file per table per session).
- Write hands to file immediately after each hand completes (append mode).

#### `session-manager.ts`

- Tracks session start time, table count, file paths.
- Creates the `data/hand-histories/` subdirectory if it doesn't exist.
- Provides the path for hand history files.
- Default save location: `<app-data>/hand-histories/` (configurable in settings).

---

### 4. Multi-Table Layout Engine (`src/renderer/hooks/useWindowLayout.ts`)

The application runs in a single Electron window that fills the primary monitor. Tables are tiled within this window.

#### Tiling Algorithm

Given `n` tables (1–9), calculate optimal grid layout:

| Tables | Grid | Layout |
|--------|------|--------|
| 1 | 1×1 | Full screen |
| 2 | 2×1 | Side by side |
| 3 | 3×1 OR 2+1 | 3 columns, or 2 top + 1 bottom centered |
| 4 | 2×2 | 2×2 grid |
| 5 | 3+2 | 3 top + 2 bottom centered |
| 6 | 3×2 | 3 columns × 2 rows |
| 7 | 4+3 | 4 top + 3 bottom centered |
| 8 | 4×2 | 4 columns × 2 rows |
| 9 | 3×3 | 3×3 grid |

Each table component receives its calculated width and height and scales all internal elements proportionally (cards, text, buttons, chips). The table component must be fully responsive.

**Implementation:**
1. On app start, detect primary monitor resolution via `electron.screen.getPrimaryDisplay()`.
2. Set window to fullscreen (or maximized borderless).
3. Calculate cell dimensions: `cellWidth = screenWidth / cols`, `cellHeight = screenHeight / rows`.
4. Position each table in its cell using CSS grid or absolute positioning.
5. Recalculate on window resize.

#### Table Scaling

Every element inside a table must scale relative to the table container size. Use a base design at 800×600 and scale factor = `min(containerWidth / 800, containerHeight / 600)`. Apply this scale to all font sizes, card sizes, chip sizes, padding, etc.

---

### 5. UI Design Spec — PokerStars Classic Theme

The visual design replicates the classic PokerStars look and feel.

#### Table Visual Design

**Table shape:** Oval/racetrack shape, centered in its container.
- **Felt:** Deep green gradient (`#0a5c2a` → `#0d7a38`), subtle fabric texture overlay (CSS repeating pattern or SVG filter for noise).
- **Rail:** Dark wood-grain border around the oval (~12px wide, `#3a2a1a` with subtle bevel/inner shadow).
- **Table edge:** Thin gold/brass line between felt and rail.

**Seats:** 6 seats arranged around the oval:
- Seat layout (clockwise from bottom-center): Bottom-center (Seat 1 / hero default), Bottom-right, Top-right, Top-center, Top-left, Bottom-left.
- The human player is ALWAYS at the bottom-center seat.
- Each seat shows:
  - Small avatar image (40×40px base, circular).
  - Player name (below avatar).
  - Stack size (below name, formatted as `$XX.XX`).
  - If active in hand: hole cards displayed behind/beside avatar.
  - If current actor: highlighted border + timer ring.

**Cards:**
- Standard poker card design. White with rounded corners.
- Face cards: rank in top-left and bottom-right, suit symbol.
- Card size: approximately 60×84px at base scale.
- Card back: PokerStars-style red pattern (or simple geometric design).
- Deal animation: cards slide from center of table to each player.
- Community cards: displayed in a row at center of the felt.
- Flip animation: cards rotate from back to face when revealed.

**Chips:**
- Bet amounts shown as a chip stack icon + dollar amount text in front of each player's seat.
- When a pot is awarded, chips slide from pot to winner.
- Main pot displayed at center, slightly below community cards.

**Dealer button:**
- White circle with "D" in black text.
- Positioned next to the button player's seat.
- Animates (slides) to next seat between hands.

**Action buttons (human player only):**
- Dynamically generated from the solver tree's available actions at the current node.
- **FOLD** button (red/dark) — always present when facing a bet.
- **CHECK** button (green) — when no outstanding bet.
- **CALL** button (green) — when facing a bet. Shows call amount.
- **BET/RAISE buttons** (blue/gold) — one button per bet size available in the solver tree. Each shows the dollar amount AND pot percentage, e.g., `BET $3.67 (33%)` or `RAISE $16.50 (75%)`.
- **No slider or manual input.** Only discrete actions from the solver tree are available. This guarantees the hand stays within the solved game tree.
- Buttons are arranged in a row: FOLD on the left, CHECK/CALL in the center, then bet/raise sizes ascending left-to-right.
- Buttons ONLY visible when it's the human player's turn.
- **Fallback mode** (no solver data): Traditional slider UI with preset sizes (33%, 50%, 67%, 75%, 100% pot, all-in).

**Timer:**
- Circular countdown ring around the acting player's avatar.
- Full ring = 30 seconds. Depletes clockwise.
- Green when >10s, yellow 5–10s, red <5s.
- When red: play the `timer-warning.mp3` sound (soft ticking).
- If timer expires for human: auto-fold (with fold animation).
- If timer expires for bot (should never happen, but safety): auto-fold.

**Winner display:**
- After showdown: winning cards highlighted with a golden glow.
- "Winner" text + amount floats above the player's seat.
- Pot chips animate toward the winner.
- Display for ~2.5 seconds before clearing for next hand.

#### Color Palette

```css
:root {
  /* Table */
  --felt-green: #0d7a38;
  --felt-dark: #0a5c2a;
  --rail-wood: #3a2a1a;
  --rail-edge: #c5a356;

  /* UI */
  --bg-dark: #1a1a2e;
  --bg-card: #16213e;
  --text-primary: #ffffff;
  --text-secondary: #a0a0b0;
  --text-gold: #ffd700;

  /* Action buttons */
  --btn-fold: #cc3333;
  --btn-call: #33aa55;
  --btn-raise: #3366cc;
  --btn-hover-fold: #ee4444;
  --btn-hover-call: #44cc66;
  --btn-hover-raise: #4477ee;

  /* Timer */
  --timer-green: #44cc66;
  --timer-yellow: #ffcc00;
  --timer-red: #ff3333;

  /* Cards */
  --card-bg: #ffffff;
  --card-border: #cccccc;
  --card-red: #cc0000;
  --card-black: #1a1a1a;
}
```

#### Typography

- Player names and stack sizes: Clean sans-serif (e.g., `"Segoe UI"`, `"Helvetica Neue"`, system font).
- Pot amount: Slightly larger, bold.
- Action labels: Bold, uppercase.
- All text must be crisp and readable at small table sizes (when 9-tabling).

---

### 6. Sound System (`src/renderer/audio/`)

#### Sound Effects Required

| Event | File | Description |
|---|---|---|
| Card deal | `deal.mp3` | Quick "thwip" of card being dealt. Plays for each card. |
| Check | `check.mp3` | Soft knock/tap on felt. |
| Bet/Raise | `bet.mp3` | Chip(s) clinking onto felt. |
| Call | `call.mp3` | Similar to bet but slightly different tone. |
| Fold | `fold.mp3` | Soft card toss / whoosh. |
| All-in | `allin.mp3` | Dramatic chip push — heavier clinking. |
| Pot collect | `chips-collect.mp3` | Chips being swept / stacked. |
| Card flip | `card-flip.mp3` | Card reveal on board. |
| Timer tick | `timer-tick.mp3` | Soft tick when timer < 5 seconds. |
| Timer warning | `timer-warning.mp3` | Urgent beeping when timer < 3 seconds. |
| Your turn | `your-turn.mp3` | Subtle chime / ding to alert player it's their action. |
| Win pot | `win.mp3` | Satisfying "cha-ching" or chip collection flourish. |

#### Implementation Notes

- Use **Howler.js** with audio sprites (combine all sounds into one file for efficiency, or load individually).
- Sounds must be mixable — multiple sounds can play simultaneously (e.g., deal sounds from different tables overlapping).
- Volume control in settings (master volume + per-category).
- When multi-tabling, sounds from all tables play but with spatial/volume adjustments:
  - The "focused" table (last clicked) plays sounds at full volume.
  - Other tables play at 50% volume.
  - "Your turn" alert plays at full volume for all tables.
- **Sound files**: Use free poker sound effects. If none available, generate simple synthesized sounds using Web Audio API as placeholders.

---

### 7. IPC Communication Protocol

All communication between main and renderer uses Electron IPC with typed channels.

#### `shared/ipc-channels.ts`

```typescript
export const IPC = {
  // Main → Renderer
  TABLE_STATE_UPDATE: 'table:state-update',        // TableSnapshot
  TABLE_HAND_COMPLETE: 'table:hand-complete',       // WinnerInfo[]
  TABLE_ERROR: 'table:error',                       // Error message
  SOUND_TRIGGER: 'sound:trigger',                   // { sound: string, volume: number }

  // Renderer → Main
  PLAYER_ACTION: 'player:action',                   // { tableId, action: ActionType, amount, solverNodeId }
  START_SESSION: 'session:start',                   // { tableCount: number, playerName: string }
  STOP_SESSION: 'session:stop',                     // {}
  UPDATE_SETTINGS: 'settings:update',               // Settings object
  GET_SESSION_STATS: 'session:get-stats',           // → SessionStats
} as const;
```

#### Data flow per action:

1. Game engine determines it's the human's turn.
2. Main queries `show_children` on the current solver node to get available actions.
3. Main sends `TABLE_STATE_UPDATE` with `currentPlayerIndex` = human's seat + `availableActions` array (derived from solver tree children, with dollar amounts and labels).
4. Renderer shows solver-driven action buttons + starts timer.
5. Human clicks an action button.
6. Renderer sends `PLAYER_ACTION` with `{ tableId, action, amount, solverNodeId }` — where `solverNodeId` is the UPI node ID of the chosen child, provided by the solver tree.
7. Main validates the action, applies it, sets `solverNodeId` as the new current node, advances game state.
8. Main sends updated `TABLE_STATE_UPDATE`.

---

### 8. Lobby / Settings UI

#### Lobby Screen (`Lobby.tsx`)

Shown on app launch. Simple, clean design with the PokerStars dark blue background.

**Elements:**
- App title: **"GRIND SIMULATOR"** in large gold text.
- **Table count selector**: Dropdown or grid of buttons (1–9). Visual preview of how the tables will be tiled.
- **Player name input**: Text field, default "Hero".
- **"START GRINDING"** button: Large, prominent, green.
- **Settings gear icon**: Opens settings panel.

#### Settings Panel (`Settings.tsx`)

- **Sound volume**: Master slider (0–100%).
- **Hand history path**: File browser to select save directory.
- **Solver configuration**:
  - **Solver executable path**: File browser to select `jesolver.exe` or `PioSOLVER-edge.exe`.
  - **Solver data path**: File browser to select directory containing `.cfr` files organized by scenario.
  - **Solver mode**: Toggle between "Local process" (child process via stdin/stdout) and "Remote server" (TCP connection to JESolver server).
  - **Server host/port**: Text fields, only shown when mode is "Remote server". Default: `localhost:5251`.
  - **Solver status indicator**: Green dot = connected and ready, yellow = loading tree, red = not connected / not configured.
- **Display settings**: Table theme variations (stretch goal).

---

### 9. Preload Script & Security

#### `preload/index.ts`

Use `contextBridge` to expose a safe API to the renderer:

```typescript
contextBridge.exposeInMainWorld('grindSim', {
  // Send player action (includes solver node ID for tree navigation)
  sendAction: (tableId: string, action: ActionType, amount: number, solverNodeId: string) => {
    ipcRenderer.send(IPC.PLAYER_ACTION, { tableId, action, amount, solverNodeId });
  },

  // Start/stop session
  startSession: (config: SessionConfig) => ipcRenderer.send(IPC.START_SESSION, config),
  stopSession: () => ipcRenderer.send(IPC.STOP_SESSION),

  // Listen for state updates
  onTableUpdate: (callback: (snapshot: TableSnapshot) => void) => {
    ipcRenderer.on(IPC.TABLE_STATE_UPDATE, (_, snapshot) => callback(snapshot));
  },

  onSoundTrigger: (callback: (data: SoundTrigger) => void) => {
    ipcRenderer.on(IPC.SOUND_TRIGGER, (_, data) => callback(data));
  },

  // Settings
  updateSettings: (settings: Partial<Settings>) => {
    ipcRenderer.send(IPC.UPDATE_SETTINGS, settings);
  },

  // Dialog
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
});
```

---

### 10. Card Assets

**52 cards + 1 card back = 53 SVG files.**

Generate programmatically using a script (`scripts/generate-card-svgs.ts`):
- White background, rounded corners (border-radius ~8px at base size).
- Rank in top-left corner (large) and bottom-right (inverted).
- Suit symbol below rank.
- Center pip layout following standard playing card pip patterns.
- Hearts/Diamonds in red (`#cc0000`), Clubs/Spades in black (`#1a1a1a`).
- Card back: Deep red with a geometric diamond pattern.

Standard naming: `{rank}{suit}.svg` → `Ah.svg`, `Kd.svg`, `Tc.svg`, `2s.svg`, `back.svg`.

---

### 11. Bot Name Generator

Pool of ~100 realistic poker screen names. 5 randomly chosen per table (no duplicates across tables in the same session).

**Examples:**
```
"xXPokerProXx", "FishOnTilt", "AcesUpMySleeve", "NittyProfessor",
"3BetBandit", "RiverRat420", "GTO_Wizard", "StackEmUp",
"FoldPre2024", "Button_Clicker", "ChetFaker99", "TiltMachine",
"SuitsMe", "PotCommitted", "Bluffy_McBluff", "QuadsOrFold",
"RunBadFeelGood", "SharkBait55", "PocketRockets", "DonkeyKong42",
"FlushDraw_Hero", "SetMiner_Pro", "OverBet4Value", "CheckRaiseKing",
"NLHE_Grinder", "ColdDeck_Carl", "BarrelHouse", "ValueTown_Mayor",
"bluff_catcher", "the_nuts_42", "SBvsUTG", "4betJam",
...
```

---

## Implementation Phases

### Phase 1: Foundation (HIGH PRIORITY)
1. **Project scaffolding**: Electron + Vite + React + TypeScript setup.
2. **Core types**: All shared type definitions.
3. **Deck & shuffle**: `deck.ts` with tests.
4. **Hand evaluator**: `hand-evaluator.ts` with comprehensive tests.
5. **Pot manager**: `pot-manager.ts` with side pot tests.
6. **Betting round logic**: `betting-round.ts` with tests for all edge cases.
7. **Game engine**: `game-engine.ts` — single table, full hand loop.

### Phase 2: Bot AI
8. **Preflop charts**: Full 6-max GTO charts hardcoded.
9. **Action selector**: Weighted random action from frequencies.
10. **Bot timing**: Realistic delay generator.
11. **Bot controller**: Integrate preflop + timing. (Postflop placeholder: always check/fold.)

### Phase 3: Single Table UI
12. **Card SVG generation**: Script to produce all 53 card images.
13. **Table component**: Oval felt table with 6 seats, basic layout.
14. **Player display**: Avatars, names, stacks, cards.
15. **Community cards**: Display with deal animation.
16. **Action buttons**: Solver-driven discrete action buttons (fold/check/call + bet/raise sizes from tree). Fallback slider for non-solver mode.
17. **Timer**: 30-second circular countdown.
18. **IPC integration**: Connect renderer to game engine.
19. **Basic sound**: Deal, bet, fold sounds.

### Phase 4: Polish & Multi-Table
20. **Full sound system**: All sounds, volume control, multi-table mixing.
21. **Animations**: Card dealing, chip movement, winner celebration.
22. **Multi-table manager**: Spawn up to 9 engines, tile layout.
23. **Lobby**: Table count selector, name input, start button.
24. **Settings**: Volume, paths.
25. **Hand history writer**: PokerStars format output.

### Phase 5: Solver Integration (UPI Protocol)
26. **Solver bridge**: Spawn JESolver/PioSolver child process, UPI stdin/stdout communication, response parsing with END marker handling, SOLVER: block consumption.
27. **Hand order cache**: Call `show_hand_order` at startup, build hand → index map for all 1326 combos.
28. **Scenario mapper**: Map Grind Simulator preflop action sequences to `config.json` scenario keys and `.cfr` file paths.
29. **Node ID builder**: Convert Grind Simulator's action history to UPI node ID format (`r:0:b6:c:Qs7h2d:c:b15`), including cumulative bet amounts and board cards.
30. **Available actions query**: Use `show_children` to discover available actions at the current node, send to renderer as discrete action buttons for the human player.
31. **Strategy lookup**: `show_strategy` → parse N×1326 float matrix → extract bot's hand frequencies → weighted random action selection.
32. **Tree cache + preloading**: LRU cache for loaded trees, preload `.cfr` files during preflop round, `free_tree` when memory is tight.
33. **Heuristic fallback**: When `.cfr` file missing or node not found, fall back to hand-strength-based heuristic + traditional slider UI.

### Phase 6: Final Polish
30. **Edge cases**: All-in side pots, split pots, run-outs.
31. **Testing**: End-to-end hand simulation tests.
32. **Performance**: Profile multi-table performance, optimize.
33. **Packaging**: electron-builder for distributable.

---

## Key Technical Decisions

1. **All game logic in main process**: Never trust the renderer with game state. The renderer is a "dumb terminal."
2. **Cents internally**: All monetary amounts stored as integers (cents) to avoid floating-point errors. Convert to dollars only for display and hand history output.
3. **Deterministic RNG for testing**: Support an optional seed mode for reproducible hands during development/testing.
4. **Immutable state snapshots**: Each `TableSnapshot` sent to the renderer is a fresh object (deep copy). No shared mutable state across IPC.
5. **No database**: Hand histories are plain text files. Session data is in-memory only.
6. **Graceful degradation**: If solver files are missing or solver executable not found, bots still play using preflop charts + simple heuristic postflop. The app is fully functional without solver data.
7. **Single solver process**: One JESolver/PioSolver child process shared across all tables. Strategy requests are queued sequentially. Bot thinking delays (1–8s) provide ample time for solver lookups (<10ms each).
8. **UPI protocol over stdin/stdout**: No binary `.cfr` parsing in JavaScript. Instead, delegate all tree loading and strategy queries to the solver process via the UPI text protocol. This is simpler, more reliable, and guaranteed compatible with solver file format changes.
9. **LRU tree cache**: Only one tree can be loaded at a time in a single solver process. Track which tree is loaded; `free_tree` + `load_tree` when switching. Preload trees during preflop betting to hide latency.
10. **Solver-driven action buttons**: The human player can only choose actions that exist in the solver tree. `show_children` is queried at each decision point and the available actions are rendered as discrete buttons in the UI. This guarantees the entire hand stays within the solved game tree — no bet size mismatch can ever occur. The chosen child's node ID is passed back with the action, so tree navigation is exact.

---

## Testing Strategy

- **Unit tests** (Vitest): Deck, hand evaluator, pot manager, betting round, preflop charts, HH formatter, UPI response parser, node ID builder, scenario mapper.
- **Integration tests**: Full hand simulation — deal → actions → showdown → HH output verification.
- **Solver bridge tests** (requires solver executable): Connect to solver, load a test `.cfr` file, verify `show_hand_order` parsing, verify `show_strategy` parsing, verify `show_children` parsing, verify node ID navigation, verify available actions extraction for human player.
- **Node ID builder tests**: Given a sequence of Grind Simulator actions, verify the correct UPI node ID string is produced. Test edge cases: all-in, multiple raises, turn/river cards, check-raise lines.
- **Available actions tests**: Verify that `show_children` output is correctly parsed into `AvailableAction[]` with proper dollar amounts and labels.
- **Hand evaluator stress test**: Evaluate all 133,784,560 possible 7-card combinations; verify ranking monotonicity.
- **Hand history validation**: Parse generated HH files with a reference parser; verify they're importable by PokerTracker.

---

## Performance Targets

- **Hand evaluation**: < 1ms per hand.
- **Bot decision (preflop)**: < 5ms (plus artificial delay).
- **Bot decision (solver postflop)**: < 50ms for `show_strategy` UPI round-trip (plus artificial delay).
- **Tree loading**: `load_tree` takes 2–30s depending on tree size. Preload during preflop round to hide latency. Use JESolver's `fast` load option when available.
- **State snapshot IPC**: < 2ms round trip.
- **UI render at 9 tables**: Smooth 60fps, no jank during animations.
- **Memory**: < 500MB for app itself. Solver process memory depends on tree size (500MB–8GB per loaded tree). Total system memory usage will be dominated by the solver.
- **Solver startup**: < 5 seconds from process spawn to `is_ready ok!`.

---

## Configuration Defaults

```typescript
const DEFAULTS = {
  blinds: { sb: 0.50, bb: 1.00 },
  startingStack: 100.00,     // 100bb
  maxTables: 9,
  actionTimeout: 30,          // seconds
  botDelayMin: 1000,          // ms
  botDelayMax: 8000,          // ms
  playerName: 'Hero',
  handHistoryPath: '<appData>/grind-simulator/hand-histories/',
  solverDataPath: '<appData>/grind-simulator/solver/',
  solverExecutablePath: '',    // Path to jesolver.exe or PioSOLVER-edge.exe
  solverMode: 'child_process', // 'child_process' | 'tcp_server'
  solverServerHost: 'localhost',
  solverServerPort: 5251,
  masterVolume: 0.8,
  pauseBetweenHands: 2500,    // ms
};
```
