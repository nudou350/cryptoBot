import { Candle, TradeSignal, Position } from '../types';
import { BaseStrategy } from '../strategies/BaseStrategy';

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
   * Fetch historical candles from Binance
   * For 2 years of 1-minute candles, we need approximately 1,051,200 candles
   * Binance API limits us to 1000 candles per request, so we need multiple requests
   */
  public async fetchHistoricalData(daysBack: number = 730): Promise<void> {
    console.log(`[Backtesting] Fetching ${daysBack} days of historical data for ${this.symbol}...`);

    const now = Date.now();
    const startTime = now - (daysBack * 24 * 60 * 60 * 1000);
    const interval = '1m';
    const limit = 1000; // Max allowed by Binance

    const allCandles: Candle[] = [];
    let currentStartTime = startTime;

    // Calculate how many requests we need
    const totalMinutes = daysBack * 24 * 60;
    const totalRequests = Math.ceil(totalMinutes / limit);

    console.log(`[Backtesting] Estimated ${totalRequests} requests needed...`);

    for (let i = 0; i < totalRequests; i++) {
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${this.symbol}&interval=${interval}&startTime=${currentStartTime}&limit=${limit}`;
        const response = await fetch(url);

        if (!response.ok) {
          console.error(`[Backtesting] Request failed with status ${response.status}`);
          break;
        }

        const data: any = await response.json();

        if (!data || data.length === 0) {
          console.log(`[Backtesting] No more data available`);
          break;
        }

        const candles: Candle[] = data.map((kline: any) => ({
          timestamp: kline[0],
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5])
        }));

        allCandles.push(...candles);

        // Update start time for next batch
        currentStartTime = candles[candles.length - 1].timestamp + 60000; // +1 minute

        // Progress update
        if ((i + 1) % 50 === 0 || i === totalRequests - 1) {
          const progress = ((i + 1) / totalRequests * 100).toFixed(1);
          console.log(`[Backtesting] Progress: ${progress}% (${allCandles.length.toLocaleString()} candles)`);
        }

        // Rate limiting: Binance allows ~1200 requests per minute
        // Adding small delay to be safe
        if (i % 100 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Stop if we've reached the present
        if (currentStartTime >= now) {
          break;
        }
      } catch (error) {
        console.error(`[Backtesting] Error fetching data batch ${i}:`, error);
        // Continue with what we have
        break;
      }
    }

    this.candles = allCandles;
    console.log(`[Backtesting] Fetched ${this.candles.length.toLocaleString()} candles`);

    if (this.candles.length > 0) {
      const startDate = new Date(this.candles[0].timestamp).toISOString();
      const endDate = new Date(this.candles[this.candles.length - 1].timestamp).toISOString();
      console.log(`[Backtesting] Data range: ${startDate} to ${endDate}`);
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
