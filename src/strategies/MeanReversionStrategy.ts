import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateBollingerBands, calculateRSI } from '../utils/indicators';

/**
 * Mean Reversion Strategy - FIXED (Target: 65%+ win rate)
 *
 * Best for: All market conditions (RSI-based entries work everywhere)
 * Win Rate Target: 65-70%
 * Risk Level: Medium
 *
 * Strategy:
 * - Buy when RSI < 40 (relaxed oversold condition)
 * - Exit ONLY at take profit (5%) OR stop loss (2%)
 * - NO premature exits - let winners run!
 * - Risk/reward ratio 1:2.5 (2% SL, 5% TP)
 *
 * FIXES APPLIED:
 * - Removed Bollinger Bands requirement (too restrictive)
 * - Relaxed RSI from 35 to 40 (more entry opportunities)
 * - Removed ALL premature exit conditions (1.5%, 2%, middle band exits)
 * - Only exits at full TP or SL - proper risk management
 * - Removed cooldown (was blocking good setups)
 */
export class MeanReversionStrategy extends BaseStrategy {
  private readonly rsiPeriod: number = 14;
  private readonly oversoldThreshold: number = 40; // Relaxed for more entries
  private readonly stopLossPercent: number = 2.0; // 2% stop loss
  private readonly takeProfitPercent: number = 5.0; // 5% take profit (1:2.5 R:R)

  private entryPrice: number = 0;
  private inPosition: boolean = false;

  constructor() {
    super('MeanReversion');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = this.rsiPeriod + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate RSI
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const currentRSI = rsi[rsi.length - 1];

    // Check if RSI is ready
    if (currentRSI === 0) {
      return { action: 'hold', price: currentPrice, reason: 'RSI not ready' };
    }

    // POSITION MANAGEMENT: If we have a position, manage it
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Take profit at 5% - ONLY EXIT CONDITION #1
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
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

    // ENTRY: Simple RSI oversold condition
    const isOversold = currentRSI < this.oversoldThreshold;

    if (isOversold && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 5% target
      // Risk/Reward = 1:2.5

      this.inPosition = true;
      this.entryPrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MeanRev BUY: RSI ${currentRSI.toFixed(1)} (oversold) [R:R 1:2.5, SL: -${this.stopLossPercent}%, TP: +${this.takeProfitPercent}%]`
      };
    }

    // HOLD: Waiting for oversold condition
    let reason = 'Waiting for RSI oversold';

    if (currentRSI < 45) {
      reason = `Approaching entry (RSI: ${currentRSI.toFixed(1)}, need < ${this.oversoldThreshold})`;
    } else if (currentRSI > 60) {
      reason = `Overbought zone (RSI: ${currentRSI.toFixed(1)})`;
    } else {
      reason = `Neutral (RSI: ${currentRSI.toFixed(1)}, need < ${this.oversoldThreshold})`;
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
