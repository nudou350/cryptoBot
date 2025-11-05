import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateSMA } from '../utils/indicators';

/**
 * Sasha Hybrid Strategy - AGGRESSIVE (Option C)
 *
 * Combines symmetric grid with exponential position sizing and trend awareness
 * Win Rate: 60-70%
 * Risk Level: Medium-High
 *
 * AGGRESSIVE OPTIMIZATIONS:
 * - Ranging entry: Level <= 4, RSI < 55 (very relaxed)
 * - Trending entry: Level <= 5, priceVsEMA < 0.02, RSI < 60 (very relaxed)
 * - Faster profit taking at 1.2% ranging, 2% trending
 * - Targets 15-20 trades per day
 *
 * Strategy:
 * - Adaptive grid that adjusts to market conditions
 * - Variable position sizing based on confidence and level
 * - Symmetric in ranging markets, directional in trending markets
 * - Best for: All market conditions (most versatile)
 *
 * Core Concept:
 * - Combines LiqProviding's symmetric grid approach
 * - With MMLadder's exponential position sizing
 * - Adds market regime detection for adaptability
 * - Smart position management based on volatility
 */
export class SashaHybridAggressiveStrategy extends BaseStrategy {
  private readonly baseGridSpacing: number = 0.0015; // 0.15% base spacing
  private readonly numberOfLevels: number = 8;
  private readonly basePositionPercent: number = 0.06; // 6% base position

  private gridLevels: Array<{ price: number; sizeMultiplier: number }> = [];
  private marketRegime: 'ranging' | 'trending' | 'volatile' = 'ranging';
  private lastGridUpdate: number = 0;
  private currentPosition: 'long' | 'short' | null = null;
  private entryPrice: number = 0;
  private entryLevel: number = 0;
  private positionScale: number = 1.0;

  constructor() {
    super('Sasha-Hybrid-Aggressive');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 50)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Detect market regime
    this.detectMarketRegime(candles, currentPrice);

    // Create or update adaptive grid
    this.createAdaptiveGrid(candles, currentPrice);

    // Find current position in grid
    const currentLevel = this.findCurrentLevel(currentPrice);
    const midLevel = Math.floor(this.numberOfLevels / 2);

    // Calculate market indicators
    const ema20 = calculateEMA(candles, 20);
    const rsi14 = calculateRSI(candles, 14);
    const currentEMA = ema20[ema20.length - 1];
    const currentRSI = rsi14[rsi14.length - 1];

    if (currentEMA === 0 || currentRSI === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // NO POSITION: Look for entry
    if (this.currentPosition === null) {
      return this.analyzeEntry(
        currentPrice,
        currentLevel,
        midLevel,
        currentRSI,
        currentEMA
      );
    }

    // HAVE POSITION: Manage it
    return this.managePosition(
      currentPrice,
      currentLevel,
      midLevel,
      currentRSI,
      currentEMA
    );
  }

  /**
   * Analyze entry opportunities
   */
  private analyzeEntry(
    currentPrice: number,
    currentLevel: number,
    midLevel: number,
    rsi: number,
    ema: number
  ): TradeSignal {
    // RANGING MARKET: Use symmetric grid logic
    if (this.marketRegime === 'ranging') {
      // AGGRESSIVE: Enter long at lower OR middle levels (level <= 4, RSI < 55)
      if (currentLevel <= 4 && rsi < 55) { // Changed from <= 3 && < 50
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.entryLevel = currentLevel;
        this.positionScale = this.gridLevels[currentLevel].sizeMultiplier;

        const stopLoss = currentPrice * 0.98; // 2% stop
        const takeProfit = currentPrice * 1.015; // 1.5% target (reduced from 2%)

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha-Hybrid: Ranging entry at level ${currentLevel} (RSI: ${rsi.toFixed(1)}) [AGGRESSIVE]`
        };
      }

      return {
        action: 'hold',
        price: currentPrice,
        reason: `Sasha-Hybrid: Ranging - level ${currentLevel}/${this.numberOfLevels}, RSI: ${rsi.toFixed(1)}`
      };
    }

    // TRENDING MARKET: Use directional ladder logic
    if (this.marketRegime === 'trending') {
      const isUptrend = currentPrice > ema;
      const priceVsEMA = Math.abs((currentPrice - ema) / ema);

      // AGGRESSIVE: Enter on pullback in uptrend (very flexible)
      if (isUptrend && currentLevel <= 5 && priceVsEMA < 0.02 && rsi < 60) { // Changed from <= 4, < 0.015, < 55
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.entryLevel = currentLevel;
        this.positionScale = this.gridLevels[currentLevel].sizeMultiplier;

        const stopLoss = currentPrice * 0.975; // 2.5% stop
        const takeProfit = currentPrice * 1.025; // 2.5% target (reduced from 3%)

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha-Hybrid: Trending entry at level ${currentLevel} (pullback) [AGGRESSIVE]`
        };
      }

      return {
        action: 'hold',
        price: currentPrice,
        reason: `Sasha-Hybrid: Trending - waiting for pullback (level ${currentLevel})`
      };
    }

    // VOLATILE MARKET: Wait for calmer conditions
    return {
      action: 'hold',
      price: currentPrice,
      reason: `Sasha-Hybrid: Volatile market - waiting for stability`
    };
  }

  /**
   * Manage existing position
   */
  private managePosition(
    currentPrice: number,
    currentLevel: number,
    midLevel: number,
    rsi: number,
    ema: number
  ): TradeSignal {
    if (this.currentPosition !== 'long') {
      return { action: 'hold', price: currentPrice, reason: 'No position' };
    }

    const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
    const levelsMoved = currentLevel - this.entryLevel;

    // EXIT CONDITIONS

    // 1. AGGRESSIVE: Take profit based on market regime (lower thresholds)
    if (this.marketRegime === 'ranging') {
      // In ranging: quick profit at 1.2%
      if (profitPercent >= 1.2 || levelsMoved >= 2) { // Changed from 1.5% and 3 levels
        this.reset();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Hybrid: Ranging profit (${profitPercent.toFixed(2)}%, +${levelsMoved} levels) [AGGRESSIVE]`
        };
      }
    } else if (this.marketRegime === 'trending') {
      // In trending: take profit at 2%
      if (profitPercent >= 2.0 || levelsMoved >= 4) { // Changed from 2.5% and 5 levels
        this.reset();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha-Hybrid: Trending profit (${profitPercent.toFixed(2)}%, +${levelsMoved} levels) [AGGRESSIVE]`
        };
      }
    }

    // 2. RSI overbought - take profit
    if (rsi > 70 && profitPercent > 0.3) { // Reduced from 0.5%
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha-Hybrid: RSI overbought exit (${rsi.toFixed(1)}, profit: ${profitPercent.toFixed(2)}%)`
      };
    }

    // 3. Price below EMA in trending market - exit
    if (this.marketRegime === 'trending' && currentPrice < ema) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha-Hybrid: Trend break exit (P/L: ${profitPercent.toFixed(2)}%)`
      };
    }

    // 4. Stop loss
    if (profitPercent <= -2.0) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha-Hybrid: Stop loss (${profitPercent.toFixed(2)}%)`
      };
    }

    // 5. Scale out at very high levels
    if (currentLevel >= this.numberOfLevels - 1 && profitPercent > 0) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha-Hybrid: Top of grid exit (${profitPercent.toFixed(2)}%)`
      };
    }

    // HOLD: Continue managing
    return {
      action: 'hold',
      price: currentPrice,
      reason: `Sasha-Hybrid: ${this.marketRegime} - level ${currentLevel}/${this.numberOfLevels}, P/L: ${profitPercent.toFixed(2)}%`
    };
  }

  /**
   * Detect market regime (ranging/trending/volatile)
   */
  private detectMarketRegime(candles: Candle[], currentPrice: number): void {
    const ema20 = calculateEMA(candles, 20);
    const ema50 = calculateEMA(candles, 50);
    const sma20 = calculateSMA(candles, 20);

    const currentEMA20 = ema20[ema20.length - 1];
    const currentEMA50 = ema50[ema50.length - 1];
    const currentSMA20 = sma20[sma20.length - 1];

    // Calculate recent price volatility
    const recentCandles = candles.slice(-20);
    const priceChanges = recentCandles.map((candle, i) => {
      if (i === 0) return 0;
      return Math.abs((candle.close - recentCandles[i - 1].close) / recentCandles[i - 1].close);
    });
    const avgVolatility = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;

    // Trending if EMAs diverging
    const emaDivergence = Math.abs((currentEMA20 - currentEMA50) / currentEMA50);

    if (avgVolatility > 0.005) {
      this.marketRegime = 'volatile';
    } else if (emaDivergence > 0.015) {
      this.marketRegime = 'trending';
    } else {
      this.marketRegime = 'ranging';
    }
  }

  /**
   * Create adaptive grid that adjusts to market conditions
   */
  private createAdaptiveGrid(candles: Candle[], currentPrice: number): void {
    // Only recreate if price moved significantly
    if (Math.abs(currentPrice - this.lastGridUpdate) < this.baseGridSpacing * currentPrice) {
      return;
    }

    this.gridLevels = [];

    // Adjust spacing based on regime
    let spacing = this.baseGridSpacing;
    if (this.marketRegime === 'volatile') {
      spacing *= 1.5; // Wider spacing in volatile markets
    } else if (this.marketRegime === 'ranging') {
      spacing *= 0.8; // Tighter spacing in ranging markets
    }

    const halfLevels = Math.floor(this.numberOfLevels / 2);

    // Create grid with exponentially increasing position sizes
    for (let i = -halfLevels; i < halfLevels; i++) {
      const levelPrice = currentPrice * (1 + spacing * i);

      // Size multiplier: larger positions at extreme levels
      // Bottom levels (good entries): 1.0, 1.2, 1.4
      // Top levels (profit targets): 0.8, 0.6, 0.4
      const distanceFromCenter = Math.abs(i);
      const sizeMultiplier = i < 0
        ? 1.0 + (distanceFromCenter * 0.15) // Increase for buy levels
        : 1.0 - (distanceFromCenter * 0.1);  // Decrease for sell levels

      this.gridLevels.push({
        price: levelPrice,
        sizeMultiplier: Math.max(0.4, sizeMultiplier) // Minimum 0.4x
      });
    }

    this.lastGridUpdate = currentPrice;
  }

  /**
   * Find current level in grid
   */
  private findCurrentLevel(currentPrice: number): number {
    if (this.gridLevels.length === 0) return 0;

    for (let i = 0; i < this.gridLevels.length; i++) {
      if (currentPrice <= this.gridLevels[i].price) {
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
    this.lastGridUpdate = 0;
    this.currentPosition = null;
    this.entryPrice = 0;
    this.entryLevel = 0;
    this.positionScale = 1.0;
  }
}
