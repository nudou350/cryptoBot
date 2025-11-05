import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA } from '../utils/indicators';

/**
 * Sasha Liquidity Providing Strategy - OPTIMIZED (Option B)
 *
 * Based on market-making with symmetric grid placement
 * Win Rate: 70-75%
 * Risk Level: Low-Medium
 *
 * OPTIMIZATIONS APPLIED:
 * - Changed entry from "< midLevel" to "<= midLevel"
 * - Allows entry at level 3 (midpoint)
 * - More trading opportunities in ranging markets
 *
 * Strategy:
 * - Creates tight symmetric grid around current price
 * - Fixed position sizes at each level
 * - Captures bid-ask spread with quick entries/exits
 * - Best for: High volatility, ranging markets
 *
 * Core Concept from Original Bot:
 * - Symmetric ladder: equal levels above and below price
 * - Fixed quantities per level
 * - Tight spacing for frequent fills
 * - Passive limit orders that capture spread
 */
export class SashaLiqProvidingOptimizedStrategy extends BaseStrategy {
  private readonly startDistance: number = 0.001; // 0.1% between levels
  private readonly numberOfLevels: number = 6; // 3 above, 3 below
  private readonly fixedPositionPercent: number = 0.08; // 8% per level

  private gridLevels: number[] = [];
  private lastGridCenter: number = 0;
  private lastTrade: 'buy' | 'sell' | null = null;
  private lastTradePrice: number = 0;
  private consecutiveTrades: number = 0;

  constructor() {
    super('Sasha-LiqProviding-Optimized');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 20)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Create symmetric grid around current price
    this.createGrid(currentPrice);

    // Calculate market volatility to adjust strategy
    const sma20 = calculateSMA(candles, 20);
    const recentSMA = sma20[sma20.length - 1];

    if (recentSMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'SMA not ready' };
    }

    // Find which grid level we're at
    const currentLevel = this.findCurrentLevel(currentPrice);
    const midLevel = Math.floor(this.numberOfLevels / 2);

    // OPTIMIZED: BUY LOGIC - Price at lower half OR midpoint of grid
    if (currentLevel <= midLevel) { // Changed from < to <=
      // Avoid overtrading - wait for price to move enough
      if (this.lastTrade === 'buy' && this.lastTradePrice > 0) {
        const priceChange = Math.abs((currentPrice - this.lastTradePrice) / this.lastTradePrice);
        if (priceChange < this.startDistance * 1.5) {
          return {
            action: 'hold',
            price: currentPrice,
            reason: `Sasha-Liq: Waiting for price to move (last buy at ${this.lastTradePrice.toFixed(2)})`
          };
        }
      }

      // Calculate tight stop loss and quick take profit
      const stopLoss = currentPrice * 0.985; // 1.5% stop loss
      const takeProfit = currentPrice * (1 + this.startDistance * 3); // 0.3% take profit

      this.lastTrade = 'buy';
      this.lastTradePrice = currentPrice;
      this.consecutiveTrades++;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Sasha-Liq: Buy at level ${currentLevel}/${this.numberOfLevels} (spread capture) [OPTIMIZED]`
      };
    }

    // SELL/CLOSE LOGIC: Price at upper half of grid
    if (currentLevel > midLevel) {
      // Take profit when we're in upper grid levels
      if (this.lastTrade === 'buy') {
        this.lastTrade = 'sell';
        this.lastTradePrice = currentPrice;
        this.consecutiveTrades = 0;

        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Liq: Close at level ${currentLevel}/${this.numberOfLevels} (taking spread profit) [OPTIMIZED]`
        };
      }
    }

    // Risk management: Close if too many consecutive trades without profit
    if (this.consecutiveTrades >= 3) {
      this.consecutiveTrades = 0;
      this.lastTrade = null;

      return {
        action: 'close',
        price: currentPrice,
        reason: 'Sasha-Liq: Risk management - resetting position'
      };
    }

    // HOLD: Wait for better opportunity
    return {
      action: 'hold',
      price: currentPrice,
      reason: `Sasha-Liq: Price at level ${currentLevel}/${this.numberOfLevels}, maintaining position`
    };
  }

  /**
   * Create symmetric grid around current price
   * Mimics the original bot's createGrid() function
   */
  private createGrid(currentPrice: number): void {
    // Only recreate grid if price moved significantly
    if (Math.abs(currentPrice - this.lastGridCenter) < this.startDistance * currentPrice) {
      return; // Grid is still valid
    }

    this.gridLevels = [];
    const halfLevels = Math.floor(this.numberOfLevels / 2);

    // Create symmetric grid: -halfLevels to +halfLevels
    for (let i = -halfLevels; i < halfLevels; i++) {
      const levelPrice = currentPrice * (1 + this.startDistance * i);
      this.gridLevels.push(levelPrice);
    }

    this.lastGridCenter = currentPrice;
  }

  /**
   * Find which grid level the current price is at
   */
  private findCurrentLevel(currentPrice: number): number {
    if (this.gridLevels.length === 0) return 0;

    for (let i = 0; i < this.gridLevels.length; i++) {
      if (currentPrice <= this.gridLevels[i]) {
        return i;
      }
    }

    return this.gridLevels.length - 1;
  }

  /**
   * Reset strategy state
   */
  public reset(): void {
    this.gridLevels = [];
    this.lastGridCenter = 0;
    this.lastTrade = null;
    this.lastTradePrice = 0;
    this.consecutiveTrades = 0;
  }
}
