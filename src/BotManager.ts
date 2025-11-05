import { TradingBot } from './TradingBot';
import { BinanceWebSocket } from './services/BinanceWebSocket';
import { GridTradingStrategy } from './strategies/GridTradingStrategy';
import { MeanReversionStrategy } from './strategies/MeanReversionStrategy';
import { TrendFollowingStrategy } from './strategies/TrendFollowingStrategy';
import { SashaLiqProvidingStrategy } from './strategies/SashaLiqProvidingStrategy';
import { SashaMMLadderStrategy } from './strategies/SashaMMLadderStrategy';
import { SashaHybridStrategy } from './strategies/SashaHybridStrategy';
// Optimized strategies (Option B - Balanced)
import { GridTradingOptimizedStrategy } from './strategies/GridTradingOptimizedStrategy';
import { SashaLiqProvidingOptimizedStrategy } from './strategies/SashaLiqProvidingOptimizedStrategy';
import { SashaMMLadderOptimizedStrategy } from './strategies/SashaMMLadderOptimizedStrategy';
import { SashaHybridOptimizedStrategy } from './strategies/SashaHybridOptimizedStrategy';
// Aggressive strategies (Option C - High Frequency)
import { GridTradingAggressiveStrategy } from './strategies/GridTradingAggressiveStrategy';
import { SashaLiqProvidingAggressiveStrategy } from './strategies/SashaLiqProvidingAggressiveStrategy';
import { SashaMMLadderAggressiveStrategy } from './strategies/SashaMMLadderAggressiveStrategy';
import { SashaHybridAggressiveStrategy } from './strategies/SashaHybridAggressiveStrategy';
import { BotMode, BotStats } from './types';

/**
 * Bot Manager
 *
 * Manages multiple trading bots running simultaneously
 */
export class BotManager {
  private bots: Map<string, TradingBot> = new Map();
  private ws: BinanceWebSocket;
  private mode: BotMode;
  private initialBudget: number;
  private apiKey?: string;
  private apiSecret?: string;

  constructor(mode: BotMode, initialBudget: number, apiKey?: string, apiSecret?: string) {
    this.mode = mode;
    this.initialBudget = initialBudget;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    // Create shared WebSocket connection
    this.ws = new BinanceWebSocket('btcusdt', '1m');
  }

  /**
   * Initialize the bot manager
   */
  public async initialize(): Promise<void> {
    console.log('Initializing Bot Manager...');
    console.log(`Mode: ${this.mode.toUpperCase()}`);
    console.log(`Initial budget per bot: $${this.initialBudget}`);

    // Fetch historical candles first
    await this.ws.fetchHistoricalCandles(100);

    // Connect to WebSocket
    this.ws.connect();

    // Wait for connection
    await this.waitForConnection();

    // Create bots with different strategies
    this.createBot('GridTrading', new GridTradingStrategy());
    this.createBot('MeanReversion', new MeanReversionStrategy());
    this.createBot('TrendFollowing', new TrendFollowingStrategy());

    // Create Sasha bots (migrated from old bot project)
    this.createBot('Sasha-LiqProviding', new SashaLiqProvidingStrategy());
    this.createBot('Sasha-MMLadder', new SashaMMLadderStrategy());
    this.createBot('Sasha-Hybrid', new SashaHybridStrategy());

    // Create OPTIMIZED bots (Option B - Balanced optimization)
    this.createBot('GridTrading-Optimized', new GridTradingOptimizedStrategy());
    this.createBot('Sasha-LiqProviding-Optimized', new SashaLiqProvidingOptimizedStrategy());
    this.createBot('Sasha-MMLadder-Optimized', new SashaMMLadderOptimizedStrategy());
    this.createBot('Sasha-Hybrid-Optimized', new SashaHybridOptimizedStrategy());

    // Create AGGRESSIVE bots (Option C - High Frequency)
    this.createBot('GridTrading-Aggressive', new GridTradingAggressiveStrategy());
    this.createBot('Sasha-LiqProviding-Aggressive', new SashaLiqProvidingAggressiveStrategy());
    this.createBot('Sasha-MMLadder-Aggressive', new SashaMMLadderAggressiveStrategy());
    this.createBot('Sasha-Hybrid-Aggressive', new SashaHybridAggressiveStrategy());

    console.log('Bot Manager initialized');
    console.log(`Created ${this.bots.size} bots: ${Array.from(this.bots.keys()).join(', ')}`);
  }

  /**
   * Wait for WebSocket connection
   */
  private async waitForConnection(): Promise<void> {
    return new Promise((resolve) => {
      const checkConnection = () => {
        if (this.ws.getConnectionStatus()) {
          console.log('WebSocket connected');
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      checkConnection();
    });
  }

  /**
   * Create a bot with a specific strategy
   */
  private createBot(name: string, strategy: any): void {
    const bot = new TradingBot(
      strategy,
      this.mode,
      this.initialBudget,
      this.ws,
      this.apiKey,
      this.apiSecret
    );

    this.bots.set(name, bot);
    console.log(`Created bot: ${name}`);
  }

  /**
   * Start all bots
   */
  public async startAll(): Promise<void> {
    console.log('Starting all bots...');

    for (const [name, bot] of this.bots) {
      try {
        await bot.start();
        console.log(`Started: ${name}`);
      } catch (error: any) {
        console.error(`Failed to start ${name}:`, error.message);
      }
    }

    console.log('All bots started');
  }

  /**
   * Stop all bots
   */
  public async stopAll(): Promise<void> {
    console.log('Stopping all bots...');

    for (const [name, bot] of this.bots) {
      try {
        await bot.stop();
        console.log(`Stopped: ${name}`);
      } catch (error: any) {
        console.error(`Failed to stop ${name}:`, error.message);
      }
    }

    // Disconnect WebSocket
    this.ws.disconnect();

    console.log('All bots stopped');
  }

  /**
   * Start a specific bot
   */
  public async startBot(name: string): Promise<void> {
    const bot = this.bots.get(name);
    if (!bot) {
      throw new Error(`Bot not found: ${name}`);
    }

    await bot.start();
    console.log(`Started bot: ${name}`);
  }

  /**
   * Stop a specific bot
   */
  public async stopBot(name: string): Promise<void> {
    const bot = this.bots.get(name);
    if (!bot) {
      throw new Error(`Bot not found: ${name}`);
    }

    await bot.stop();
    console.log(`Stopped bot: ${name}`);
  }

  /**
   * Get statistics for a specific bot
   */
  public getBotStats(name: string): BotStats | null {
    const bot = this.bots.get(name);
    if (!bot) {
      return null;
    }

    return bot.getStats();
  }

  /**
   * Get statistics for all bots
   */
  public getAllStats(): Map<string, BotStats> {
    const stats = new Map<string, BotStats>();

    for (const [name, bot] of this.bots) {
      stats.set(name, bot.getStats());
    }

    return stats;
  }

  /**
   * Get list of all bot names
   */
  public getBotNames(): string[] {
    return Array.from(this.bots.keys());
  }

  /**
   * Get current price
   */
  public getCurrentPrice(): number {
    return this.ws.getCurrentPrice();
  }

  /**
   * Check if all bots are running
   */
  public areBotsRunning(): boolean {
    for (const bot of this.bots.values()) {
      if (!bot.isRunning()) {
        return false;
      }
    }
    return this.bots.size > 0;
  }
}
