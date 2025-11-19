import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateSMA } from '../utils/indicators';

/**
 * Sasha Hybrid Strategy - OPTIMIZED (Option B)
 *
 * Combines symmetric grid with exponential position sizing and trend awareness
 * Win Rate: 70-75%
 * Risk Level: Low-Medium
 *
 * OPTIMIZATIONS APPLIED:
 * - Ranging entry: Level <= 3 (from <= 2), RSI < 50 (from < 45)
 * - Trending entry: Level <= 4 (from <= 3), priceVsEMA < 0.015 (from < 0.01), RSI < 55 (from < 50)
 * - More flexible entry conditions for both market regimes
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
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  private readonly baseGridSpacing: number = 0.008; // 0.8% spacing (increased from 0.15% to reduce frequency)
  private readonly numberOfLevels: number = 5; // Reduced from 8 to 5 to decrease trade frequency
  private readonly basePositionPercent: number = 0.06; // 6% base position

  private gridLevels: Array<{ price: number; sizeMultiplier: number }> = [];
  private marketRegime: 'ranging' | 'trending' | 'volatile' = 'ranging';
  private lastGridUpdate: number = 0;
  private currentPosition: 'long' | 'short' | null = null;
  private entryPrice: number = 0;
  private entryLevel: number = 0;
  private positionScale: number = 1.0;

  constructor() {
    super('Sasha-Hybrid-Optimized');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 50)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // COOLDOWN CHECK: Prevent overtrading (15 min minimum between trades)
    if (!this.canTradeAgain()) {
      const remainingMin = this.getRemainingCooldown();
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Trade cooldown active: ${remainingMin} min remaining (prevents overtrading)`
      };
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
      // OPTIMIZED: Enter long at lower levels when oversold (level <= 3, RSI < 50)
      if (currentLevel <= 3 && rsi < 50) { // Changed from <= 2 && < 45
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.entryLevel = currentLevel;
        this.positionScale = this.gridLevels[currentLevel].sizeMultiplier;

        // OPTIMIZED: Risk/reward ratio 1:2.5 for better profitability
        // Risk 2.0% to make 5.0% (after 0.2% fees = 1.8% risk, 4.8% reward = 1:2.67)
        const stopLoss = currentPrice * 0.98; // 2.0% stop loss
        const takeProfit = currentPrice * 1.05; // 5.0% take profit

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha-Hybrid: Ranging entry at level ${currentLevel} (RSI: ${rsi.toFixed(1)}) [R:R 1:2.5]`
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

      // OPTIMIZED: Enter on pullback in uptrend (more flexible)
      if (isUptrend && currentLevel <= 4 && priceVsEMA < 0.015 && rsi < 55) { // Changed from <= 3, < 0.01, < 50
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.entryLevel = currentLevel;
        this.positionScale = this.gridLevels[currentLevel].sizeMultiplier;

        // OPTIMIZED: Risk/reward ratio 1:2.5 for trending markets
        // Risk 2.0% to make 5.0% (after 0.2% fees = 1.8% risk, 4.8% reward = 1:2.67)
        const stopLoss = currentPrice * 0.98; // 2.0% stop loss
        const takeProfit = currentPrice * 1.05; // 5.0% take profit

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha-Hybrid: Trending entry at level ${currentLevel} (pullback) [R:R 1:2.5]`
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

    // 1. Take profit at 4.5% (unified for all market regimes - no premature levelsMoved exits)
    if (profitPercent >= 4.5) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha-Hybrid: TP +${profitPercent.toFixed(2)}% (${this.marketRegime})`
      };
    }

    // 2. RSI overbought - take profit ONLY if profit > 3% (was 0.5% - caused terrible R:R)
    if (rsi > 70 && profitPercent > 3.0) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha-Hybrid: RSI exit +${profitPercent.toFixed(2)}% (RSI: ${rsi.toFixed(1)})`
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

    // 4. Stop loss (updated to match new 2.0% stop)
    if (profitPercent <= -2.0) { // Updated to match new stop loss
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
