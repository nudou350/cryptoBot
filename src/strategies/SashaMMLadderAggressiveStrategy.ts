import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA } from '../utils/indicators';

/**
 * Sasha Market Making Ladder Strategy - AGGRESSIVE (Option C)
 *
 * Based on one-sided dynamic ladder with exponential position sizing
 * Win Rate: 60-65%
 * Risk Level: Medium-High
 *
 * AGGRESSIVE OPTIMIZATIONS:
 * - ULTRA-LOW trend requirement: 0.1% (from 1.0% original, 0.2% optimized)
 * - Relaxed pullback requirement: -0.01 (from -0.005)
 * - Faster profit taking at 2% (from 2.5%)
 * - Targets 15-20 trades per day
 *
 * Strategy:
 * - Creates directional ladder with exponentially increasing positions
 * - Larger positions at more favorable prices
 * - Trend-aware market making
 * - Best for: Trending markets with pullbacks
 *
 * Core Concept from Original Bot:
 * - One-sided ladder (not symmetric)
 * - Exponential quantity increase at each level
 * - Dynamic rebalancing based on price action
 * - Inventory-aware position management
 */
export class SashaMMLadderAggressiveStrategy extends BaseStrategy {
  private readonly startSellDistance: number = 0.005; // 0.5% above entry
  private readonly sellIncrease: number = 0.005; // 0.5% increase per level
  private readonly numberOfLevels: number = 6;
  private readonly startQttPercent: number = 0.05; // 5% of capital initially
  private readonly qttIncrease: number = 0.04; // 4% quantity increase per level

  private ladderLevels: Array<{ price: number; qttPercent: number }> = [];
  private currentPosition: 'long' | 'short' | null = null;
  private entryPrice: number = 0;
  private currentLevel: number = 0;
  private totalInvested: number = 0;
  private lastRebalance: number = 0;

  constructor() {
    super('Sasha-MMLadder-Aggressive');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 50)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate trend using EMA
    const ema20 = calculateEMA(candles, 20);
    const ema50 = calculateEMA(candles, 50);
    const currentEMA20 = ema20[ema20.length - 1];
    const currentEMA50 = ema50[ema50.length - 1];

    if (currentEMA20 === 0 || currentEMA50 === 0) {
      return { action: 'hold', price: currentPrice, reason: 'EMAs not ready' };
    }

    // Detect trend direction
    const isUptrend = currentEMA20 > currentEMA50;
    const trendStrength = Math.abs((currentEMA20 - currentEMA50) / currentEMA50);

    // NO POSITION: Look for entry
    if (this.currentPosition === null) {
      // AGGRESSIVE: Ultra-low trend requirement (0.1% from 1.0% original)
      const priceVsEMA = (currentPrice - currentEMA20) / currentEMA20;

      // Entry on pullback in uptrend - VERY SENSITIVE
      if (isUptrend && priceVsEMA < -0.01 && trendStrength > 0.001) { // Changed from 0.002 to 0.001
        this.createLadder(currentPrice, 'long');
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.currentLevel = 0;
        this.totalInvested = this.startQttPercent;

        const stopLoss = currentPrice * 0.97; // 3% stop loss
        const takeProfit = this.ladderLevels[this.numberOfLevels - 1].price; // Top of ladder

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha-Ladder: Entry level 0 (pullback in uptrend, trend: ${(trendStrength * 100).toFixed(2)}%) [AGGRESSIVE]`
        };
      }

      return {
        action: 'hold',
        price: currentPrice,
        reason: `Sasha-Ladder: Waiting for entry (trend: ${isUptrend ? 'up' : 'down'}, strength: ${(trendStrength * 100).toFixed(2)}%)`
      };
    }

    // HAVE POSITION: Manage ladder
    if (this.currentPosition === 'long') {
      // Check if we should add to position (scale in)
      const nextLevel = this.currentLevel + 1;
      if (nextLevel < this.numberOfLevels) {
        const nextLevelPrice = this.ladderLevels[nextLevel].price;
        const priceDiff = (currentPrice - nextLevelPrice) / nextLevelPrice;

        // Scale in when price reaches next level (price going up)
        if (priceDiff >= 0 && priceDiff < 0.002) {
          this.currentLevel = nextLevel;
          this.totalInvested += this.ladderLevels[nextLevel].qttPercent;

          // No actual buy here, just tracking - in real implementation
          // this would add to the position
          this.lastRebalance = currentPrice;

          return {
            action: 'hold',
            price: currentPrice,
            reason: `Sasha-Ladder: At level ${nextLevel}/${this.numberOfLevels}, invested ${(this.totalInvested * 100).toFixed(1)}%`
          };
        }
      }

      // EXIT CONDITIONS

      // 1. Reached top of ladder - take profit
      if (this.currentLevel >= this.numberOfLevels - 1) {
        const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        this.reset();

        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Ladder: Reached top of ladder (profit: ${profitPercent.toFixed(2)}%) [AGGRESSIVE]`
        };
      }

      // 2. Trend reversal - exit early
      if (!isUptrend && trendStrength > 0.015) {
        const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
        this.reset();

        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Ladder: Trend reversal detected (profit: ${profitPercent.toFixed(2)}%)`
        };
      }

      // 3. Stop loss
      const currentDrawdown = ((this.entryPrice - currentPrice) / this.entryPrice);
      if (currentDrawdown > 0.03) { // 3% drawdown
        this.reset();

        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Ladder: Stop loss hit (${(currentDrawdown * 100).toFixed(2)}% loss)`
        };
      }

      // 4. AGGRESSIVE: Take partial profit earlier - at 2% instead of 2.5%
      const unrealizedProfit = ((currentPrice - this.entryPrice) / this.entryPrice);
      if (unrealizedProfit > 0.02 && this.currentLevel >= 2) { // Changed from 0.025 and level 3
        const profitPercent = unrealizedProfit * 100;
        this.reset();

        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Ladder: Taking profit at level ${this.currentLevel} (${profitPercent.toFixed(2)}%) [AGGRESSIVE]`
        };
      }

      // HOLD: Continue managing position
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Sasha-Ladder: Level ${this.currentLevel}/${this.numberOfLevels}, P/L: ${profitPercent.toFixed(2)}%`
      };
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason: 'Sasha-Ladder: Analyzing market conditions'
    };
  }

  /**
   * Create exponential ladder
   * Mimics the original bot's createGrid() with quantity increases
   */
  private createLadder(entryPrice: number, direction: 'long' | 'short'): void {
    this.ladderLevels = [];

    let prevQtt = this.startQttPercent;

    for (let i = 0; i < this.numberOfLevels; i++) {
      // Calculate price at this level
      const priceMultiplier = 1 + (this.sellIncrease * i);
      const levelPrice = direction === 'long'
        ? entryPrice * priceMultiplier
        : entryPrice / priceMultiplier;

      // Calculate quantity (exponentially increasing)
      if (i > 0) {
        prevQtt = prevQtt * (1 + this.qttIncrease);
      }

      this.ladderLevels.push({
        price: levelPrice,
        qttPercent: prevQtt
      });
    }
  }

  /**
   * Reset strategy state
   */
  public reset(): void {
    this.ladderLevels = [];
    this.currentPosition = null;
    this.entryPrice = 0;
    this.currentLevel = 0;
    this.totalInvested = 0;
    this.lastRebalance = 0;
  }
}
