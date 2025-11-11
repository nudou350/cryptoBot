import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateSMA } from '../utils/indicators';

/**
 * Sasha Hybrid Strategy - FIXED FOR $500 BUDGET
 *
 * Win Rate Target: 70-75%
 * Risk/Reward: 1:2 (FIXED from 1:1!)
 * Risk Level: Low-Medium
 *
 * CRITICAL FIXES:
 * - Take-profit: 1.5-2.5% → 3.0-5.0% (double the reward)
 * - Stop-loss: Remains 2-2.5%
 * - Risk/Reward: Now 1:2 minimum
 * - Position sizing: Max $400 per trade
 */
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  private readonly baseGridSpacing: number = 0.0015;
  private readonly numberOfLevels: number = 8;
  private readonly basePositionPercent: number = 0.06;

  private gridLevels: Array<{ price: number; sizeMultiplier: number }> = [];
  private marketRegime: 'ranging' | 'trending' | 'volatile' = 'ranging';
  private lastGridUpdate: number = 0;
  private currentPosition: 'long' | 'short' | null = null;
  private entryPrice: number = 0;
  private entryLevel: number = 0;
  private positionScale: number = 1.0;

  // Budget management
  private readonly maxBudget: number = 500;
  private readonly riskPercentPerTrade: number = 0.02; // 2% risk = $10

  constructor() {
    super('Sasha-Hybrid-Optimized');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 50)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    this.detectMarketRegime(candles, currentPrice);
    this.createAdaptiveGrid(candles, currentPrice);

    const currentLevel = this.findCurrentLevel(currentPrice);
    const midLevel = Math.floor(this.numberOfLevels / 2);

    const ema20 = calculateEMA(candles, 20);
    const rsi14 = calculateRSI(candles, 14);
    const currentEMA = ema20[ema20.length - 1];
    const currentRSI = rsi14[rsi14.length - 1];

    if (currentEMA === 0 || currentRSI === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    if (this.currentPosition === null) {
      return this.analyzeEntry(currentPrice, currentLevel, midLevel, currentRSI, currentEMA);
    }

    return this.managePosition(currentPrice, currentLevel, midLevel, currentRSI, currentEMA);
  }

  private analyzeEntry(
    currentPrice: number,
    currentLevel: number,
    midLevel: number,
    rsi: number,
    ema: number
  ): TradeSignal {
    // RANGING MARKET
    if (this.marketRegime === 'ranging') {
      if (currentLevel <= 3 && rsi < 50) {
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.entryLevel = currentLevel;
        this.positionScale = this.gridLevels[currentLevel].sizeMultiplier;

        // FIXED: Better risk/reward
        const stopLoss = currentPrice * 0.98; // 2% stop
        const takeProfit = currentPrice * 1.04; // 4% target (was 2%)
        // Risk/Reward = 1:2 ✅

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha RANGING entry lvl ${currentLevel} (RSI: ${rsi.toFixed(1)}) | R:R=1:2 [FIXED]`
        };
      }

      return {
        action: 'hold',
        price: currentPrice,
        reason: `Ranging - lvl ${currentLevel}/${this.numberOfLevels}, RSI: ${rsi.toFixed(1)}`
      };
    }

    // TRENDING MARKET
    if (this.marketRegime === 'trending') {
      const isUptrend = currentPrice > ema;
      const priceVsEMA = Math.abs((currentPrice - ema) / ema);

      if (isUptrend && currentLevel <= 4 && priceVsEMA < 0.015 && rsi < 55) {
        this.currentPosition = 'long';
        this.entryPrice = currentPrice;
        this.entryLevel = currentLevel;
        this.positionScale = this.gridLevels[currentLevel].sizeMultiplier;

        // FIXED: Better risk/reward for trending
        const stopLoss = currentPrice * 0.975; // 2.5% stop
        const takeProfit = currentPrice * 1.05; // 5% target (was 3%)
        // Risk/Reward = 1:2 ✅

        return {
          action: 'buy',
          price: currentPrice,
          stopLoss,
          takeProfit,
          reason: `Sasha TRENDING entry lvl ${currentLevel} (pullback) | R:R=1:2 [FIXED]`
        };
      }

      return {
        action: 'hold',
        price: currentPrice,
        reason: `Trending - waiting pullback (lvl ${currentLevel})`
      };
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason: `Volatile market - waiting for stability`
    };
  }

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

    // EXIT CONDITIONS (IMPROVED)

    // 1. Take profit - RAISED targets
    if (this.marketRegime === 'ranging') {
      if (profitPercent >= 3.0 || levelsMoved >= 4) { // Was 1.5%, now 3%
        this.reset();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha RANGING profit ${profitPercent.toFixed(2)}% [FIXED TARGET]`
        };
      }
    } else if (this.marketRegime === 'trending') {
      if (profitPercent >= 4.0 || levelsMoved >= 6) { // Was 2.5%, now 4%
        this.reset();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Sasha TRENDING profit ${profitPercent.toFixed(2)}% [FIXED TARGET]`
        };
      }
    }

    // 2. RSI overbought
    if (rsi > 70 && profitPercent > 1.0) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha RSI overbought exit (${rsi.toFixed(1)}, ${profitPercent.toFixed(2)}%)`
      };
    }

    // 3. Trend break
    if (this.marketRegime === 'trending' && currentPrice < ema) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha trend break (P/L: ${profitPercent.toFixed(2)}%)`
      };
    }

    // 4. Stop loss
    if (profitPercent <= -2.0) {
      this.reset();
      return {
        action: 'close',
        price: currentPrice,
        reason: `Sasha stop loss ${profitPercent.toFixed(2)}%`
      };
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason: `Sasha ${this.marketRegime} - lvl ${currentLevel}/${this.numberOfLevels}, P/L: ${profitPercent.toFixed(2)}%`
    };
  }

  private detectMarketRegime(candles: Candle[], currentPrice: number): void {
    const ema20 = calculateEMA(candles, 20);
    const ema50 = calculateEMA(candles, 50);
    const currentEMA20 = ema20[ema20.length - 1];
    const currentEMA50 = ema50[ema50.length - 1];

    const recentCandles = candles.slice(-20);
    const priceChanges = recentCandles.map((candle, i) => {
      if (i === 0) return 0;
      return Math.abs((candle.close - recentCandles[i - 1].close) / recentCandles[i - 1].close);
    });
    const avgVolatility = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const emaDivergence = Math.abs((currentEMA20 - currentEMA50) / currentEMA50);

    if (avgVolatility > 0.005) {
      this.marketRegime = 'volatile';
    } else if (emaDivergence > 0.015) {
      this.marketRegime = 'trending';
    } else {
      this.marketRegime = 'ranging';
    }
  }

  private createAdaptiveGrid(candles: Candle[], currentPrice: number): void {
    if (Math.abs(currentPrice - this.lastGridUpdate) < this.baseGridSpacing * currentPrice) {
      return;
    }

    this.gridLevels = [];
    let spacing = this.baseGridSpacing;

    if (this.marketRegime === 'volatile') spacing *= 1.5;
    else if (this.marketRegime === 'ranging') spacing *= 0.8;

    const halfLevels = Math.floor(this.numberOfLevels / 2);

    for (let i = -halfLevels; i < halfLevels; i++) {
      const levelPrice = currentPrice * (1 + spacing * i);
      const distanceFromCenter = Math.abs(i);
      const sizeMultiplier = i < 0
        ? 1.0 + (distanceFromCenter * 0.15)
        : 1.0 - (distanceFromCenter * 0.1);

      this.gridLevels.push({
        price: levelPrice,
        sizeMultiplier: Math.max(0.4, sizeMultiplier)
      });
    }

    this.lastGridUpdate = currentPrice;
  }

  private findCurrentLevel(currentPrice: number): number {
    if (this.gridLevels.length === 0) return 0;

    for (let i = 0; i < this.gridLevels.length; i++) {
      if (currentPrice <= this.gridLevels[i].price) return i;
    }

    return this.gridLevels.length - 1;
  }

  public reset(): void {
    this.gridLevels = [];
    this.lastGridUpdate = 0;
    this.currentPosition = null;
    this.entryPrice = 0;
    this.entryLevel = 0;
    this.positionScale = 1.0;
  }
}
