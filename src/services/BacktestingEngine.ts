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
  // Leverage-specific fields
  leverage?: number;
  liquidated?: boolean;
  liquidationTime?: number;
  liquidationPrice?: number;
}

export class BacktestingEngine {
  private candles: Candle[] = [];
  private symbol: string;

  // Realistic trading parameters
  private static readonly FEE_RATE = 0.00075; // 0.075% Binance fee with BNB discount
  private static readonly SLIPPAGE_RATE = 0.001; // 0.1% average slippage for market orders
  private static readonly MAX_POSITION_PERCENT = 0.20; // Max 20% of capital per trade
  private static readonly DEFAULT_POSITION_PERCENT = 0.15; // Default 15% of capital per trade

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
   * @param strategy - The trading strategy to test
   * @param initialBudget - Starting capital (default: 1000)
   * @param leverage - Leverage multiplier (default: 1 = no leverage)
   */
  public async runBacktest(
    strategy: BaseStrategy,
    initialBudget: number = 1000,
    leverage: number = 1
  ): Promise<BacktestResults> {
    const leverageStr = leverage > 1 ? ` (${leverage}x leverage)` : '';
    console.log(`[Backtesting] Starting backtest for ${strategy.getName()}${leverageStr}...`);

    if (this.candles.length < 100) {
      throw new Error('Not enough historical data. Please fetch data first.');
    }

    // Leverage parameters
    const LIQUIDATION_THRESHOLD = 0.90; // Liquidate at 90% loss of margin
    let liquidated = false;
    let liquidationTime: number | undefined;
    let liquidationPrice: number | undefined;

    let currentBudget = initialBudget;
    let position: Position | null = null;
    const trades: BacktestTrade[] = [];
    let peakBudget = initialBudget;
    let maxDrawdown = 0;

    // We need enough candles for strategy analysis
    // For hourly strategies: need at least 60 * 60 = 3600 candles
    // For regular strategies: need at least 200 candles
    const CANDLE_HISTORY = 4000; // Enough for hourly strategies with 60+ periods
    const startIndex = CANDLE_HISTORY;

    for (let i = startIndex; i < this.candles.length; i++) {
      const currentCandle = this.candles[i];
      const historicalCandles = this.candles.slice(Math.max(0, i - CANDLE_HISTORY), i);
      const currentPrice = currentCandle.close;

      // If we have a position, check exit conditions
      if (position && !liquidated) {
        const unrealizedPnL = (currentPrice - position.entryPrice) * position.amount;
        const unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

        // Check for liquidation (with leverage)
        const marginUsed = position.unrealizedPnL; // We stored margin in unrealizedPnL
        const leveragedLoss = Math.abs(Math.min(0, unrealizedPnL));

        if (leverage > 1 && leveragedLoss >= marginUsed * LIQUIDATION_THRESHOLD) {
          // LIQUIDATION - lost 90%+ of margin
          liquidated = true;
          liquidationTime = currentCandle.timestamp;
          liquidationPrice = currentPrice;

          // Lose all margin
          trades.push({
            entryTime: position.timestamp,
            exitTime: currentCandle.timestamp,
            entryPrice: position.entryPrice,
            exitPrice: currentPrice,
            amount: position.amount,
            profit: -marginUsed, // Lost all margin
            profitPercent: -100 * LIQUIDATION_THRESHOLD,
            win: false,
            reason: 'Entry',
            exitReason: `LIQUIDATED (${leverage}x leverage)`,
            holdingPeriod: (currentCandle.timestamp - position.timestamp) / 60000
          });

          // Update max drawdown
          const drawdown = peakBudget - currentBudget;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }

          position = null;
          console.log(`[Backtesting] LIQUIDATED at $${currentPrice.toFixed(2)} - Lost ${(LIQUIDATION_THRESHOLD * 100).toFixed(0)}% of margin`);
          continue; // Skip rest of loop
        }

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
          // Apply slippage to exit price (worse fill = lower price for sells)
          const exitSlippage = currentPrice * BacktestingEngine.SLIPPAGE_RATE;
          const actualExitPrice = currentPrice - exitSlippage;

          // Calculate gross proceeds (leveraged position)
          const grossProceeds = position.amount * actualExitPrice;

          // Calculate exit fee on full leveraged position
          const exitFee = grossProceeds * BacktestingEngine.FEE_RATE;
          const netProceeds = grossProceeds - exitFee;

          // Calculate actual profit (leveraged)
          const entryCost = position.amount * position.entryPrice;
          const leveragedProfit = netProceeds - entryCost;

          // Get margin back + leveraged profit
          const marginUsed = position.unrealizedPnL; // We stored margin here
          currentBudget += marginUsed + leveragedProfit;

          const profitPercent = (leveragedProfit / marginUsed) * 100; // Return on margin
          const holdingPeriod = (currentCandle.timestamp - position.timestamp) / 60000; // in minutes

          trades.push({
            entryTime: position.timestamp,
            exitTime: currentCandle.timestamp,
            entryPrice: position.entryPrice,
            exitPrice: actualExitPrice, // Use slippage-adjusted exit price
            amount: position.amount,
            profit: leveragedProfit,
            profitPercent,
            win: leveragedProfit > 0,
            reason: 'Entry',
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
      // If no position and not liquidated, check for entry signal
      else if (!liquidated) {
        const signal = strategy.analyze(historicalCandles, currentPrice);

        if (signal.action === 'buy' && currentBudget > 0) {
          // Enter position with realistic sizing
          const marginUsed = Math.min(
            currentBudget * BacktestingEngine.DEFAULT_POSITION_PERCENT,
            currentBudget * BacktestingEngine.MAX_POSITION_PERCENT
          );

          // With leverage, position value is multiplied
          const positionValue = marginUsed * leverage;

          // Calculate entry fee on full leveraged position
          const entryFee = positionValue * BacktestingEngine.FEE_RATE;
          const actualPositionValue = positionValue - entryFee;

          // Apply slippage to entry price (worse fill = higher price for buys)
          const slippageAmount = currentPrice * BacktestingEngine.SLIPPAGE_RATE;
          const actualEntryPrice = currentPrice + slippageAmount;

          const amount = actualPositionValue / actualEntryPrice;

          currentBudget -= marginUsed; // Only deduct margin (not full leveraged amount)

          position = {
            symbol: this.symbol,
            side: 'long',
            entryPrice: actualEntryPrice, // Use slippage-adjusted price
            amount,
            currentPrice,
            unrealizedPnL: marginUsed, // Store margin used for liquidation calc
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            timestamp: currentCandle.timestamp
          };
        }
      }

      // Progress update every 50k candles
      if (i % 50000 === 0) {
        const progress = ((i - startIndex) / (this.candles.length - startIndex) * 100).toFixed(1);
        console.log(`[Backtesting] Simulating: ${progress}% (${trades.length} trades)`);
      }
    }

    // If we still have an open position at the end, close it
    if (position && !liquidated) {
      const finalPrice = this.candles[this.candles.length - 1].close;

      // Apply slippage to exit price
      const exitSlippage = finalPrice * BacktestingEngine.SLIPPAGE_RATE;
      const actualExitPrice = finalPrice - exitSlippage;

      // Calculate gross proceeds with exit fee (leveraged)
      const grossProceeds = position.amount * actualExitPrice;
      const exitFee = grossProceeds * BacktestingEngine.FEE_RATE;
      const netProceeds = grossProceeds - exitFee;

      const entryCost = position.amount * position.entryPrice;
      const leveragedProfit = netProceeds - entryCost;

      // Get margin back + leveraged profit
      const marginUsed = position.unrealizedPnL;
      currentBudget += marginUsed + leveragedProfit;

      const profitPercent = (leveragedProfit / marginUsed) * 100;
      const holdingPeriod = (this.candles[this.candles.length - 1].timestamp - position.timestamp) / 60000;

      trades.push({
        entryTime: position.timestamp,
        exitTime: this.candles[this.candles.length - 1].timestamp,
        entryPrice: position.entryPrice,
        exitPrice: actualExitPrice,
        amount: position.amount,
        profit: leveragedProfit,
        profitPercent,
        win: leveragedProfit > 0,
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
      leverage,
      liquidated,
      liquidationTime,
      liquidationPrice,
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
