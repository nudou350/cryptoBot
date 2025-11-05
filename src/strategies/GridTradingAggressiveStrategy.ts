import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA } from '../utils/indicators';

/**
 * Grid Trading Strategy - AGGRESSIVE (Option C)
 *
 * Best for: Ranging/sideways markets
 * Win Rate: 60-70% (lower due to frequency)
 * Risk Level: Medium
 *
 * AGGRESSIVE OPTIMIZATIONS:
 * - Entry zones widened to 50%/50% (buy at level <= 5, sell at level >= 5)
 * - Maximum trading frequency
 * - Targets 15-20 trades per day
 * - Higher risk, higher volume
 *
 * Strategy:
 * - Sets up a grid of buy and sell orders
 * - Profits from price oscillations
 * - Works best when price stays within a range
 */
export class GridTradingAggressiveStrategy extends BaseStrategy {
  private gridLevels: number = 10;
  private gridSpacing: number = 0.005; // 0.5% spacing
  private lastTrade: 'buy' | 'sell' | null = null;
  private lastTradePrice: number = 0;

  constructor() {
    super('GridTrading-Aggressive');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 50)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate price range for grid
    const sma50 = calculateSMA(candles, 50);
    const recentSMA = sma50[sma50.length - 1];

    if (recentSMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'SMA not ready' };
    }

    // Calculate grid boundaries (±5% from SMA)
    const gridTop = recentSMA * 1.05;
    const gridBottom = recentSMA * 0.95;
    const gridRange = gridTop - gridBottom;
    const spacing = gridRange / this.gridLevels;

    // Find current grid level
    const currentLevel = Math.floor((currentPrice - gridBottom) / spacing);

    // AGGRESSIVE: Buy at lower OR middle grid levels (level <= 5)
    if (currentLevel <= 5 && this.lastTrade !== 'buy') {
      const stopLoss = currentPrice * 0.98; // 2% stop loss
      const takeProfit = currentPrice * 1.01; // 1% take profit (tighter for faster exits)

      this.lastTrade = 'buy';
      this.lastTradePrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Grid buy at level ${currentLevel}/${this.gridLevels} [AGGRESSIVE]`
      };
    }

    // AGGRESSIVE: Sell at middle OR upper grid levels (level >= 5)
    if (currentLevel >= 5 && this.lastTrade !== 'sell') {
      this.lastTrade = 'sell';
      this.lastTradePrice = currentPrice;

      return {
        action: 'close',
        price: currentPrice,
        reason: `Grid sell at level ${currentLevel}/${this.gridLevels} (taking profit) [AGGRESSIVE]`
      };
    }

    // Check if price moved enough from last trade to trade again
    if (this.lastTradePrice > 0) {
      const priceChangePercent = Math.abs((currentPrice - this.lastTradePrice) / this.lastTradePrice);

      // AGGRESSIVE: Reduced threshold for faster re-entry
      if (priceChangePercent >= this.gridSpacing * 1.5) { // Was 2x, now 1.5x
        // Reset to allow new trades
        this.lastTrade = null;
      }
    }

    // Hold if no grid signal
    return {
      action: 'hold',
      price: currentPrice,
      reason: `Price at grid level ${currentLevel}/${this.gridLevels}, waiting for entry`
    };
  }

  /**
   * Reset strategy state (useful when starting/stopping)
   */
  public reset(): void {
    this.lastTrade = null;
    this.lastTradePrice = 0;
  }
}
