import { BaseStrategy } from './strategies/BaseStrategy';
import { FakeTradingEngine } from './engines/FakeTradingEngine';
import { RealTradingEngine } from './engines/RealTradingEngine';
import { BinanceWebSocket } from './services/BinanceWebSocket';
import { BotStats, BotMode, Candle } from './types';

/**
 * Trading Bot
 *
 * Coordinates strategy, engine, and market data
 */
export class TradingBot {
  private strategy: BaseStrategy;
  private engine: FakeTradingEngine | RealTradingEngine;
  private ws: BinanceWebSocket;
  private mode: BotMode;
  private analysisInterval: NodeJS.Timeout | null = null;
  private readonly analysisIntervalMs: number = 60000; // 1 minute

  constructor(
    strategy: BaseStrategy,
    mode: BotMode,
    initialBudget: number,
    ws: BinanceWebSocket,
    apiKey?: string,
    apiSecret?: string
  ) {
    this.strategy = strategy;
    this.mode = mode;
    this.ws = ws;

    const botName = `${strategy.getName()}-${mode}`;

    if (mode === 'fake') {
      this.engine = new FakeTradingEngine(strategy, initialBudget, botName);
    } else {
      // Both 'real' and 'testnet' modes use RealTradingEngine
      if (!apiKey || !apiSecret) {
        throw new Error('API key and secret required for real/testnet trading mode');
      }
      const isTestnet = mode === 'testnet';
      this.engine = new RealTradingEngine(strategy, initialBudget, botName, apiKey, apiSecret, isTestnet);
    }
  }

  /**
   * Start the bot
   */
  public async start(): Promise<void> {
    if (this.mode === 'real' || this.mode === 'testnet') {
      await (this.engine as RealTradingEngine).start();
    } else {
      this.engine.start();
    }

    // Start analysis loop
    this.startAnalysisLoop();
  }

  /**
   * Stop the bot
   */
  public async stop(): Promise<void> {
    // Stop analysis loop
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    // Stop engine
    if (this.mode === 'real' || this.mode === 'testnet') {
      await (this.engine as RealTradingEngine).stop();
    } else {
      this.engine.stop();
    }

    // Clear logs
    this.engine.clearLogs();
  }

  /**
   * Start periodic analysis
   */
  private startAnalysisLoop(): void {
    // Analyze immediately
    this.analyze();

    // Then analyze every minute
    this.analysisInterval = setInterval(() => {
      this.analyze();
    }, this.analysisIntervalMs);
  }

  /**
   * Analyze market and execute trades
   */
  private async analyze(): Promise<void> {
    try {
      const candles = this.ws.getCandles();
      const currentPrice = this.ws.getCurrentPrice();

      if (candles.length === 0 || currentPrice === 0) {
        console.log(`[${this.strategy.getName()}] Waiting for market data...`);
        return;
      }

      // Get signal from strategy
      const signal = this.strategy.analyze(candles, currentPrice);

      // Process signal through engine
      await this.engine.processSignal(signal, currentPrice);
    } catch (error: any) {
      console.error(`[${this.strategy.getName()}] Analysis error:`, error.message);
    }
  }

  /**
   * Get bot statistics
   */
  public getStats(): BotStats {
    return this.engine.getStats();
  }

  /**
   * Get strategy name
   */
  public getStrategyName(): string {
    return this.strategy.getName();
  }

  /**
   * Get bot mode
   */
  public getMode(): BotMode {
    return this.mode;
  }

  /**
   * Check if bot is running
   */
  public isRunning(): boolean {
    return this.engine.getIsRunning();
  }
}
