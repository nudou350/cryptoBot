import { TradingBot } from './TradingBot';
import { BinanceWebSocket } from './services/BinanceWebSocket';
import { GridTradingStrategy } from './strategies/GridTradingStrategy';
import { MeanReversionStrategy } from './strategies/MeanReversionStrategy';
import { SashaHybridOptimizedStrategy } from './strategies/SashaHybridOptimizedStrategy';
import { TripleEMAStrategy } from './strategies/TripleEMAStrategy';
import { EMARibbonStrategy } from './strategies/EMARibbonStrategy';
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
    // NOTE: initialBudget is TOTAL budget for ALL bots, will be split equally
    // Example: initialBudget=2500 with 5 bots = $500 per bot
    this.mode = mode;
    this.initialBudget = initialBudget;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    // Create shared WebSocket connection (testnet for testnet mode)
    const isTestnet = mode === 'testnet';
    this.ws = new BinanceWebSocket('btcusdt', '1m', isTestnet);
  }

  /**
   * Initialize the bot manager
   */
  public async initialize(): Promise<void> {
    console.log('Initializing Bot Manager...');
    console.log(`Mode: ${this.mode.toUpperCase()}`);

    // Define which bots to create
    const botsToCreate = [
      { name: 'MeanReversion', strategy: new MeanReversionStrategy() },
      { name: 'Sasha-Hybrid-Optimized', strategy: new SashaHybridOptimizedStrategy() },
      { name: 'GridTrading', strategy: new GridTradingStrategy() },
      { name: 'TripleEMA', strategy: new TripleEMAStrategy() },
      { name: 'EMARibbon', strategy: new EMARibbonStrategy() },
    ];

    // Calculate per-bot allocation by splitting total budget
    const numberOfBots = botsToCreate.length;
    const budgetPerBot = this.initialBudget / numberOfBots;

    console.log(`Total Budget: $${this.initialBudget}`);
    console.log(`Number of Bots: ${numberOfBots}`);
    console.log(`Budget per Bot: $${budgetPerBot.toFixed(2)}`);
    console.log('---');

    // Fetch historical candles first
    await this.ws.fetchHistoricalCandles(100);

    // Connect to WebSocket
    this.ws.connect();

    // Wait for connection
    await this.waitForConnection();

    // Create all bots with equal allocation
    for (const { name, strategy } of botsToCreate) {
      this.createBot(name, strategy, budgetPerBot);
    }

    console.log('Bot Manager initialized');
    console.log(`Created ${this.bots.size} bots: ${Array.from(this.bots.keys()).join(', ')}`);
    console.log('Each bot operates independently with its allocated budget');
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
   * Create a bot with a specific strategy and allocated budget
   */
  private createBot(name: string, strategy: any, allocatedBudget: number): void {
    const bot = new TradingBot(
      strategy,
      this.mode,
      allocatedBudget,
      this.ws,
      this.apiKey,
      this.apiSecret
    );

    this.bots.set(name, bot);
    console.log(`Created bot: ${name} with $${allocatedBudget.toFixed(2)} allocation`);
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
