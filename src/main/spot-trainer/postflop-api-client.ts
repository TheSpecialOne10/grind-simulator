import dns from 'dns';
import { resolve } from 'dns/promises';
import https from 'https';
import type { ApiScenario } from './spot-config';

// ── Response types (matching the Hetzner API spec) ──

export interface ApiActionResult {
  label: string;                    // e.g. "fold", "check", "bet_33", "raise_to_45"
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  amount: number;                   // Cumulative chips invested by this player in the hand
  increment: number;                // Per-street action size in chips (bet/raise/call cost)
  frequency: number;                // Per-hand frequency (when hand param is provided)
  childNodeId: string;              // Node ID of this action's child (e.g. "r:0:c", "r:0:b12")
}

export interface ApiStrategyResult {
  scenario: string;
  board: string;
  nodePath: string;
  street?: 'flop' | 'turn' | 'river';
  player?: 'IP' | 'OOP';
  actions: ApiActionResult[];
  pot?: { oop: number; ip: number; dead: number };
  hand?: string;
  handIndex?: number;
}

export interface ApiChildrenResult {
  actions: ApiActionResult[];
  player: 'IP' | 'OOP';
  pot: { oop: number; ip: number; dead: number };
}

// ── Client interface ──

export interface IPostflopApiClient {
  /**
   * Fetch strategy for a specific hand at a node.
   * Returns null if the API is unavailable or the node/board is not found.
   */
  getHandStrategy(
    scenarioId: string,
    board: string,
    node: string,
    hand: string
  ): Promise<ApiStrategyResult | null>;

  /**
   * Fetch available child actions at a node (lighter than full strategy).
   * Returns actions + pot investments + acting player.
   */
  getChildren(
    scenarioId: string,
    board: string,
    node: string
  ): Promise<ApiChildrenResult | null>;

  /**
   * Fetch all available scenarios from the server.
   */
  getScenarios(): Promise<ApiScenario[] | null>;

  /**
   * Fetch all available board strings for a scenario (boards present in the tree).
   */
  getBoards(scenarioId: string): Promise<string[] | null>;

  /** Returns true if the server is reachable and responding. */
  isAvailable(): Promise<boolean>;
}

// ── Concrete implementation ──

export class PostflopApiClient implements IPostflopApiClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private hostname: string;
  private agent: https.Agent;

  constructor(baseUrl: string, apiKey: string, timeoutMs = 8000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.agent = new https.Agent({ keepAlive: true });
    try { this.hostname = new URL(this.baseUrl).hostname; } catch { this.hostname = ''; }
  }

  async getHandStrategy(
    scenarioId: string,
    board: string,
    node: string,
    hand: string
  ): Promise<ApiStrategyResult | null> {
    const params = new URLSearchParams({
      scenario: scenarioId,
      board,
      node,
      hand
    });
    return this.get<ApiStrategyResult>(`/strategy?${params}`);
  }

  async getChildren(
    scenarioId: string,
    board: string,
    node: string
  ): Promise<ApiChildrenResult | null> {
    const params = new URLSearchParams({ scenario: scenarioId, board, node });
    return this.get<ApiChildrenResult>(`/children?${params}`);
  }

  async getScenarios(): Promise<ApiScenario[] | null> {
    const result = await this.get<{ scenarios: ApiScenario[] }>('/scenarios');
    return result?.scenarios ?? null;
  }

  async getBoards(scenarioId: string): Promise<string[] | null> {
    const encoded = encodeURIComponent(scenarioId);
    const result = await this.get<{ scenario: string; boards: string[] }>(`/scenarios/${encoded}/boards`);
    return result?.boards ?? null;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.authHeaders(),
        signal: controller.signal,
        // @ts-expect-error — Node.js fetch supports the agent option
        agent: this.agent,
      });
      clearTimeout(tid);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Warm up: set fast DNS resolvers, pre-resolve the hostname (cached by Node),
   * and establish a keep-alive TCP+TLS connection via a lightweight health check.
   */
  async warmUp(): Promise<void> {
    if (this.hostname) {
      try {
        dns.setServers(['1.1.1.1', '8.8.8.8']);
        const [ip] = await resolve(this.hostname);
        console.log(`[API] DNS resolved ${this.hostname} → ${ip}`);
      } catch (err) {
        console.warn('[API] DNS resolve failed:', err);
      }
    }
    // Establish TCP+TLS connection with a lightweight request
    await this.isAvailable();
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: this.authHeaders(),
        signal: controller.signal,
        // @ts-expect-error — Node.js fetch supports the agent option for keep-alive
        agent: this.agent,
      });
      clearTimeout(tid);

      if (res.status === 404) {
        console.warn(`[API] 404 GET ${path}`);
        return null;
      }
      if (res.status === 503) {
        // Solver busy loading tree — treat as unavailable for now
        console.warn(`[PostflopApi] 503 on ${path} — solver busy, falling back`);
        return null;
      }
      if (!res.ok) {
        console.warn(`[PostflopApi] HTTP ${res.status} on ${path}`);
        return null;
      }

      return await res.json() as T;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn(`[PostflopApi] Request failed for ${path}:`, err);
      }
      return null;
    }
  }
}

// ── Null implementation (fallback when no API configured) ──

export class NullPostflopApiClient implements IPostflopApiClient {
  async getHandStrategy(): Promise<null> { return null; }
  async getChildren(): Promise<null> { return null; }
  async getScenarios(): Promise<null> { return null; }
  async getBoards(): Promise<null> { return null; }
  async isAvailable(): Promise<boolean> { return false; }
}

// ── Utility ──

/**
 * Convert an API board string to a card string array.
 * "Qs7h2d" → ["Qs", "7h", "2d"]
 * "Qs7h2d5c" → ["Qs", "7h", "2d", "5c"]
 */
export function parseBoardString(board: string): string[] {
  const cards: string[] = [];
  for (let i = 0; i < board.length; i += 2) {
    cards.push(board.slice(i, i + 2));
  }
  return cards;
}

/**
 * Convert an array of card strings to an API board string.
 * ["Qs", "7h", "2d"] → "Qs7h2d"
 */
export function buildBoardString(cards: { rank: string; suit: string }[]): string {
  return cards.map(c => `${c.rank}${c.suit}`).join('');
}
