import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA } from '../utils/indicators';

/**
 * Mean Reversion Strategy - TREND-AWARE (Target: 65%+ win rate)
 *
 * Best for: Uptrending markets with pullbacks
 * Win Rate Target: 65-70%
 * Risk Level: Medium
 *
 * CRITICAL FIX APPLIED:
 * - Added EMA50 trend filter: ONLY buy oversold if price > EMA50 (uptrend)
 * - Tightened RSI from 40 to 35 (truly oversold, fewer false signals)
 * - Lowered take profit from 5% to 3% (more realistic, higher win rate)
 * - Keep 2% stop loss (1:1.5 R:R, good for mean reversion)
 *
 * Strategy:
 * - Buy when: RSI < 35 (oversold) AND price > EMA50 (uptrend)
 * - Exit at 3% profit or 2% loss
 * - ONLY trades oversold conditions in uptrends
 */
export class MeanReversionStrategy extends BaseStrategy {
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50; // Trend filter
  private readonly oversoldThreshold: number = 35; // Tightened for quality entries
  private readonly stopLossPercent: number = 2.0; // 2% stop loss
  private readonly takeProfitPercent: number = 3.0; // 3% take profit (1:1.5 R:R)

  private entryPrice: number = 0;
  private inPosition: boolean = false;

  constructor() {
    super('MeanReversion');
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

    // Check if indicators are ready
    if (currentRSI === 0 || currentEMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

    // POSITION MANAGEMENT: If we have a position, manage it
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Take profit at 3% - ONLY EXIT CONDITION #1
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, EMA: +${distanceFromEMA.toFixed(2)}%)`
        };
      }

      // Stop loss at 2% - ONLY EXIT CONDITION #2
      if (profitPercent <= -this.stopLossPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position - let it run to TP or SL
      return {
        action: 'hold',
        price: currentPrice,
        reason: `MeanRev: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // TREND FILTER: Only trade if in uptrend (price > EMA50)
    const isUptrend = currentPrice > currentEMA;

    if (!isUptrend && !this.inPosition) {
      return {
        action: 'hold',
        price: currentPrice,
        reason: `MeanRev PAUSED: Downtrend (${distanceFromEMA.toFixed(2)}% below EMA50, RSI: ${currentRSI.toFixed(1)})`
      };
    }

    // ENTRY: RSI oversold AND uptrend (oversold bounce in uptrend)
    const isOversold = currentRSI < this.oversoldThreshold;
    const isOversoldInUptrend = isOversold && isUptrend;

    if (isOversoldInUptrend && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 3% target
      // Risk/Reward = 1:1.5

      this.inPosition = true;
      this.entryPrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MeanRev BUY: Oversold in uptrend (RSI: ${currentRSI.toFixed(1)}, EMA: +${distanceFromEMA.toFixed(2)}%) [1:1.5 R:R]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for oversold in uptrend';

    if (isUptrend && currentRSI < 45) {
      reason = `Uptrend, approaching oversold (RSI: ${currentRSI.toFixed(1)}, need < ${this.oversoldThreshold})`;
    } else if (isUptrend && currentRSI > 60) {
      reason = `Uptrend but overbought (RSI: ${currentRSI.toFixed(1)})`;
    } else if (isUptrend) {
      reason = `Uptrend, neutral RSI (${currentRSI.toFixed(1)}, need < ${this.oversoldThreshold})`;
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
