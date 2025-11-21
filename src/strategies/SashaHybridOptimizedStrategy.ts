import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI } from '../utils/indicators';

/**
 * Pullback Strategy - TREND-AWARE (Target: 65%+ win rate)
 *
 * Simplified from Sasha Hybrid, with proper trend filter
 * Win Rate Target: 65-70%
 * Risk Level: Medium
 *
 * CRITICAL FIX APPLIED:
 * - Added EMA50 trend filter: ONLY buy if price > EMA50 (uptrend)
 * - Tightened RSI from 45 to 40 (fewer false entries)
 * - Lowered take profit from 4% to 2.5% (more realistic, higher win rate)
 * - Keep 2% stop loss (1:1.25 R:R)
 *
 * Strategy:
 * - Buy when: RSI < 40 AND price near EMA20 AND price > EMA50 (pullback in uptrend)
 * - Exit at 2.5% profit or 2% loss
 * - ONLY trades pullbacks in uptrends
 * - Best for: Trending markets with healthy pullbacks
 */
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  private readonly rsiPeriod: number = 14;
  private readonly emaShortPeriod: number = 20; // Pullback level
  private readonly emaLongPeriod: number = 50; // Trend filter
  private readonly oversoldThreshold: number = 40; // Tightened
  private readonly stopLossPercent: number = 2.0; // 2% stop loss
  private readonly takeProfitPercent: number = 2.5; // 2.5% take profit (1:1.25 R:R)

  private inPosition: boolean = false;
  private entryPrice: number = 0;

  constructor() {
    super('Sasha-Hybrid-Optimized');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.emaShortPeriod, this.emaLongPeriod) + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const emaShort = calculateEMA(candles, this.emaShortPeriod);
    const emaLong = calculateEMA(candles, this.emaLongPeriod);

    const currentRSI = rsi[rsi.length - 1];
    const currentEMAShort = emaShort[emaShort.length - 1];
    const currentEMALong = emaLong[emaLong.length - 1];

    if (currentRSI === 0 || currentEMAShort === 0 || currentEMALong === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMAShort = ((currentPrice - currentEMAShort) / currentEMAShort) * 100;
    const distanceFromEMALong = ((currentPrice - currentEMALong) / currentEMALong) * 100;

    // POSITION MANAGEMENT: If we have a position, manage it
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Take profit at 2.5% - ONLY EXIT CONDITION #1
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Pullback TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, EMA50: +${distanceFromEMALong.toFixed(2)}%)`
        };
      }

      // Stop loss at 2% - ONLY EXIT CONDITION #2
      if (profitPercent <= -this.stopLossPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Pullback SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position - let it run to TP or SL
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Pullback: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // TREND FILTER: Only trade if in uptrend (price > EMA50)
    const isUptrend = currentPrice > currentEMALong;

    if (!isUptrend && !this.inPosition) {
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Pullback PAUSED: Downtrend (${distanceFromEMALong.toFixed(2)}% below EMA50, RSI: ${currentRSI.toFixed(1)})`
      };
    }

    // ENTRY: RSI oversold AND price near EMA20 AND uptrend (pullback in uptrend)
    const isOversold = currentRSI < this.oversoldThreshold;
    const isPullback = currentPrice <= currentEMAShort * 1.005; // Within 0.5% of EMA20 or below
    const isPullbackInUptrend = isOversold && isPullback && isUptrend;

    if (isPullbackInUptrend && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 2.5% target
      // Risk/Reward = 1:1.25

      this.inPosition = true;
      this.entryPrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Pullback BUY: Uptrend (EMA50: +${distanceFromEMALong.toFixed(2)}%), RSI ${currentRSI.toFixed(1)}, at EMA20 [1:1.25 R:R]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for pullback in uptrend';

    if (isUptrend && isOversold && !isPullback) {
      reason = `Uptrend + oversold (RSI: ${currentRSI.toFixed(1)}), waiting for pullback to EMA20 (${distanceFromEMAShort.toFixed(2)}%)`;
    } else if (isUptrend && !isOversold && isPullback) {
      reason = `Uptrend + at EMA20, waiting for RSI < ${this.oversoldThreshold} (now ${currentRSI.toFixed(1)})`;
    } else if (isUptrend) {
      reason = `Uptrend, RSI: ${currentRSI.toFixed(1)}, EMA20: ${distanceFromEMAShort.toFixed(2)}%`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }

  /**
   * Reset strategy state
   */
  public reset(): void {
    this.inPosition = false;
    this.entryPrice = 0;
  }
}
