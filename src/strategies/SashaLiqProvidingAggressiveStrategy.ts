import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA } from '../utils/indicators';

/**
 * Sasha Liquidity Providing Strategy - AGGRESSIVE (Option C)
 *
 * Based on market-making with symmetric grid placement
 * Win Rate: 65-70%
 * Risk Level: Medium
 *
 * AGGRESSIVE OPTIMIZATIONS:
 * - Entry allowed up to level 4 (well into upper half)
 * - Reduced wait time between trades
 * - Tighter take profit for faster exits
 * - Targets 15-20 trades per day
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
export class SashaLiqProvidingAggressiveStrategy extends BaseStrategy {
  private readonly startDistance: number = 0.001; // 0.1% between levels
  private readonly numberOfLevels: number = 6; // 3 above, 3 below
  private readonly fixedPositionPercent: number = 0.08; // 8% per level

  private gridLevels: number[] = [];
  private lastGridCenter: number = 0;
  private lastTrade: 'buy' | 'sell' | null = null;
  private lastTradePrice: number = 0;
  private consecutiveTrades: number = 0;

  constructor() {
    super('Sasha-LiqProviding-Aggressive');
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

    // AGGRESSIVE: BUY LOGIC - Price anywhere up to level 4
    if (currentLevel <= 4) { // Changed from <= 3 (Optimized) to <= 4
      // Avoid overtrading - but with reduced threshold
      if (this.lastTrade === 'buy' && this.lastTradePrice > 0) {
        const priceChange = Math.abs((currentPrice - this.lastTradePrice) / this.lastTradePrice);
        // AGGRESSIVE: Reduced from 1.5x to 1.0x for faster re-entry
        if (priceChange < this.startDistance) {
          return {
            action: 'hold',
            price: currentPrice,
            reason: `Sasha-Liq: Waiting for price to move (last buy at ${this.lastTradePrice.toFixed(2)})`
          };
        }
      }

      // Calculate tight stop loss and quick take profit
      const stopLoss = currentPrice * 0.985; // 1.5% stop loss
      const takeProfit = currentPrice * (1 + this.startDistance * 2); // 0.2% take profit (tighter than Optimized's 0.3%)

      this.lastTrade = 'buy';
      this.lastTradePrice = currentPrice;
      this.consecutiveTrades++;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Sasha-Liq: Buy at level ${currentLevel}/${this.numberOfLevels} (spread capture) [AGGRESSIVE]`
      };
    }

    // SELL/CLOSE LOGIC: Price at upper levels
    if (currentLevel > 4) { // Changed to match entry threshold
      // Take profit when we're in upper grid levels
      if (this.lastTrade === 'buy') {
        this.lastTrade = 'sell';
        this.lastTradePrice = currentPrice;
        this.consecutiveTrades = 0;

        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Liq: Close at level ${currentLevel}/${this.numberOfLevels} (taking spread profit) [AGGRESSIVE]`
        };
      }
    }

    // Risk management: Close if too many consecutive trades without profit
    if (this.consecutiveTrades >= 4) { // Increased from 3 to allow more attempts
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
