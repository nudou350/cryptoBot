import { Candle, TradeSignal, Position } from '../types';
import { BaseStrategy } from '../strategies/BaseStrategy';
import fs from 'fs';
import path from 'path';

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  amount: number;
  profit: number;
  profitPercent: number;
  win: boolean;
  reason: string;
  exitReason: string;
  holdingPeriod: number; // in minutes
}

export interface BacktestResults {
  strategyName: string;
  startDate: number;
  endDate: number;
  initialBudget: number;
  finalBudget: number;
  totalPnL: number;
  totalPnLPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  profitFactor: number; // Total wins / Total losses
  avgHoldingPeriod: number; // in minutes
  trades: BacktestTrade[];
}

export class BacktestingEngine {
  private candles: Candle[] = [];
  private symbol: string;

  constructor(symbol: string = 'BTCUSDT') {
    this.symbol = symbol.toUpperCase();
  }

  /**
   * Load historical candles from pre-downloaded data file
   * This is much faster and more reliable than fetching from API
   */
  public loadHistoricalData(): void {
    console.log(`[Backtesting] Loading historical data for ${this.symbol}...`);

    try {
      // Try to load from data directory
      const dataPath = path.join(__dirname, '../../data/btc-2year-historical.json');

      if (!fs.existsSync(dataPath)) {
        throw new Error('Historical data file not found. Please run: npm run download-data');
      }

      const fileContent = fs.readFileSync(dataPath, 'utf-8');
      const data = JSON.parse(fileContent);

      this.candles = data.candles;

      console.log(`[Backtesting] Loaded ${this.candles.length.toLocaleString()} candles`);
      console.log(`[Backtesting] Data range: ${data.startDate} to ${data.endDate}`);
      console.log(`[Backtesting] Days of data: ${data.daysOfData}`);
      console.log(`[Backtesting] Downloaded at: ${data.downloadedAt}`);
    } catch (error: any) {
      console.error(`[Backtesting] Error loading historical data:`, error.message);
      throw new Error('Failed to load historical data. Please run: npm run download-data');
    }
  }

  /**
   * Run backtest simulation for a given strategy
   */
  public async runBacktest(
    strategy: BaseStrategy,
    initialBudget: number = 1000
  ): Promise<BacktestResults> {
    console.log(`[Backtesting] Starting backtest for ${strategy.getName()}...`);

    if (this.candles.length < 100) {
      throw new Error('Not enough historical data. Please fetch data first.');
    }

    let currentBudget = initialBudget;
    let position: Position | null = null;
    const trades: BacktestTrade[] = [];
    let peakBudget = initialBudget;
    let maxDrawdown = 0;

    // We need at least 100 candles for strategy analysis
    const startIndex = 100;

    for (let i = startIndex; i < this.candles.length; i++) {
      const currentCandle = this.candles[i];
      const historicalCandles = this.candles.slice(Math.max(0, i - 100), i);
      const currentPrice = currentCandle.close;

      // If we have a position, check exit conditions
      if (position) {
        const unrealizedPnL = (currentPrice - position.entryPrice) * position.amount;
        const unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

        let shouldExit = false;
        let exitReason = '';

        // Check stop loss
        if (position.stopLoss && currentPrice <= position.stopLoss) {
          shouldExit = true;
          exitReason = 'Stop Loss';
        }

        // Check take profit
        if (position.takeProfit && currentPrice >= position.takeProfit) {
          shouldExit = true;
          exitReason = 'Take Profit';
        }

        // Also check strategy signal for exit
        const signal = strategy.analyze(historicalCandles, currentPrice);
        if (signal.action === 'sell' || signal.action === 'close') {
          shouldExit = true;
          exitReason = exitReason || signal.reason;
        }

        if (shouldExit) {
          // Close position
          const sellAmount = position.amount * currentPrice;
          currentBudget += sellAmount;

          const profit = unrealizedPnL;
          const profitPercent = unrealizedPnLPercent;
          const holdingPeriod = (currentCandle.timestamp - position.timestamp) / 60000; // in minutes

          trades.push({
            entryTime: position.timestamp,
            exitTime: currentCandle.timestamp,
            entryPrice: position.entryPrice,
            exitPrice: currentPrice,
            amount: position.amount,
            profit,
            profitPercent,
            win: profit > 0,
            reason: position.unrealizedPnL.toString(), // Store entry reason (reusing field)
            exitReason,
            holdingPeriod
          });

          // Update max drawdown
          if (currentBudget > peakBudget) {
            peakBudget = currentBudget;
          }
          const drawdown = peakBudget - currentBudget;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }

          position = null;
        }
      }
      // If no position, check for entry signal
      else {
        const signal = strategy.analyze(historicalCandles, currentPrice);

        if (signal.action === 'buy' && currentBudget > 0) {
          // Enter position
          const positionValue = currentBudget * 0.95; // Use 95% of budget (keep 5% for fees)
          const amount = positionValue / currentPrice;

          currentBudget -= positionValue;

          position = {
            symbol: this.symbol,
            side: 'long',
            entryPrice: currentPrice,
            amount,
            currentPrice,
            unrealizedPnL: 0,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            timestamp: currentCandle.timestamp
          };

          // Record trade for tracking entry reason
          position.unrealizedPnL = parseFloat(signal.reason.substring(0, 100)); // Hack to store reason
        }
      }

      // Progress update every 50k candles
      if (i % 50000 === 0) {
        const progress = ((i - startIndex) / (this.candles.length - startIndex) * 100).toFixed(1);
        console.log(`[Backtesting] Simulating: ${progress}% (${trades.length} trades)`);
      }
    }

    // If we still have an open position at the end, close it
    if (position) {
      const finalPrice = this.candles[this.candles.length - 1].close;
      const sellAmount = position.amount * finalPrice;
      currentBudget += sellAmount;

      const profit = (finalPrice - position.entryPrice) * position.amount;
      const profitPercent = ((finalPrice - position.entryPrice) / position.entryPrice) * 100;
      const holdingPeriod = (this.candles[this.candles.length - 1].timestamp - position.timestamp) / 60000;

      trades.push({
        entryTime: position.timestamp,
        exitTime: this.candles[this.candles.length - 1].timestamp,
        entryPrice: position.entryPrice,
        exitPrice: finalPrice,
        amount: position.amount,
        profit,
        profitPercent,
        win: profit > 0,
        reason: 'Entry',
        exitReason: 'Backtest End',
        holdingPeriod
      });
    }

    // Calculate statistics
    const winningTrades = trades.filter(t => t.win);
    const losingTrades = trades.filter(t => !t.win);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

    const results: BacktestResults = {
      strategyName: strategy.getName(),
      startDate: this.candles[0].timestamp,
      endDate: this.candles[this.candles.length - 1].timestamp,
      initialBudget,
      finalBudget: currentBudget,
      totalPnL: currentBudget - initialBudget,
      totalPnLPercent: ((currentBudget - initialBudget) / initialBudget) * 100,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      avgWinPercent: winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.profitPercent, 0) / winningTrades.length
        : 0,
      avgLossPercent: losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + t.profitPercent, 0) / losingTrades.length
        : 0,
      largestWin: winningTrades.length > 0
        ? Math.max(...winningTrades.map(t => t.profit))
        : 0,
      largestLoss: losingTrades.length > 0
        ? Math.min(...losingTrades.map(t => t.profit))
        : 0,
      maxDrawdown,
      maxDrawdownPercent: (maxDrawdown / peakBudget) * 100,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins,
      avgHoldingPeriod: trades.length > 0
        ? trades.reduce((sum, t) => sum + t.holdingPeriod, 0) / trades.length
        : 0,
      trades
    };

    console.log(`[Backtesting] ${strategy.getName()} completed:`);
    console.log(`  - Total Trades: ${results.totalTrades}`);
    console.log(`  - Win Rate: ${results.winRate.toFixed(2)}%`);
    console.log(`  - Total PnL: $${results.totalPnL.toFixed(2)} (${results.totalPnLPercent.toFixed(2)}%)`);
    console.log(`  - Max Drawdown: $${results.maxDrawdown.toFixed(2)} (${results.maxDrawdownPercent.toFixed(2)}%)`);

    return results;
  }

  /**
   * Get the loaded candles
   */
  public getCandles(): Candle[] {
    return this.candles;
  }
}
