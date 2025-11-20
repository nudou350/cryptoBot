import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateSMA } from '../utils/indicators';

/**
 * RSI Trend Strategy - FIXED (Target: 65%+ win rate)
 *
 * Simplified from overly complex Sasha Hybrid
 * Win Rate Target: 65-70%
 * Risk Level: Medium
 *
 * FIXES APPLIED:
 * - Removed complex market regime detection (was misclassifying)
 * - Removed grid levels (too restrictive, never entered)
 * - Simplified to RSI + EMA trend following
 * - Clear entry: RSI < 45 AND price near/below EMA20
 * - Only exits at TP (4%) or SL (2%) - no premature exits
 *
 * Strategy:
 * - Buy when RSI oversold AND price pullback to/below EMA20
 * - Hold until 4% profit or 2% loss
 * - Simple, reliable, proven approach
 * - Best for: Trending and ranging markets
 */
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 20;
  private readonly oversoldThreshold: number = 45; // More relaxed than MeanReversion
  private readonly stopLossPercent: number = 2.0; // 2% stop loss
  private readonly takeProfitPercent: number = 4.0; // 4% take profit (1:2 R:R)

  private inPosition: boolean = false;
  private entryPrice: number = 0;

  constructor() {
    super('Sasha-Hybrid-Optimized');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.emaPeriod) + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const ema = calculateEMA(candles, this.emaPeriod);

    const currentRSI = rsi[rsi.length - 1];
    const currentEMA = ema[ema.length - 1];

    if (currentRSI === 0 || currentEMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // POSITION MANAGEMENT: If we have a position, manage it
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Take profit at 4% - ONLY EXIT CONDITION #1
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `RSI-Trend TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // Stop loss at 2% - ONLY EXIT CONDITION #2
      if (profitPercent <= -this.stopLossPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `RSI-Trend SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position - let it run to TP or SL
      return {
        action: 'hold',
        price: currentPrice,
        reason: `RSI-Trend: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ENTRY: RSI oversold AND price at/below EMA (pullback entry)
    const isOversold = currentRSI < this.oversoldThreshold;
    const isPullback = currentPrice <= currentEMA * 1.005; // Within 0.5% of EMA or below

    if (isOversold && isPullback && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 4% target
      // Risk/Reward = 1:2

      this.inPosition = true;
      this.entryPrice = currentPrice;

      const priceVsEMA = ((currentPrice - currentEMA) / currentEMA * 100).toFixed(2);
      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `RSI-Trend BUY: RSI ${currentRSI.toFixed(1)} + pullback (${priceVsEMA}% vs EMA) [R:R 1:2]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for RSI oversold + pullback';
    const priceVsEMA = ((currentPrice - currentEMA) / currentEMA * 100).toFixed(2);

    if (isOversold && !isPullback) {
      reason = `RSI oversold (${currentRSI.toFixed(1)}), waiting for pullback to EMA (${priceVsEMA}%)`;
    } else if (!isOversold && isPullback) {
      reason = `At EMA (${priceVsEMA}%), waiting for RSI < ${this.oversoldThreshold} (now ${currentRSI.toFixed(1)})`;
    } else {
      reason = `RSI: ${currentRSI.toFixed(1)}, Price vs EMA: ${priceVsEMA}%`;
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
