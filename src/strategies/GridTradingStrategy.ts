import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA, calculateEMA } from '../utils/indicators';

/**
 * Grid Trading Strategy - TREND-AWARE (Target: 65%+ win rate)
 *
 * Best for: Ranging markets WITHIN an uptrend
 * Win Rate Target: 65-75%
 * Risk Level: Low-Medium
 *
 * CRITICAL FIX APPLIED:
 * - Added EMA50 trend filter: ONLY buy dips if price > EMA50 (uptrend confirmation)
 * - This prevents buying falling knives in downtrends
 * - Tightened take profit to 2% (more realistic)
 * - Keep 2% stop loss (1:1 R:R, but high win rate compensates)
 *
 * Strategy:
 * - Buy when: price < SMA20 AND price > EMA50 (dip in uptrend)
 * - Exit at 2% profit or 2% loss
 * - ONLY trades in uptrends - this is the key to survival
 */
export class GridTradingStrategy extends BaseStrategy {
  private readonly smaPeriod: number = 20;
  private readonly emaPeriod: number = 50; // Trend filter
  private readonly stopLossPercent: number = 2.0; // 2% stop loss
  private readonly takeProfitPercent: number = 2.0; // 2% take profit (1:1 R:R, high win rate)

  private inPosition: boolean = false;
  private entryPrice: number = 0;

  constructor() {
    super('GridTrading');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.smaPeriod, this.emaPeriod) + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const sma = calculateSMA(candles, this.smaPeriod);
    const ema = calculateEMA(candles, this.emaPeriod);

    const currentSMA = sma[sma.length - 1];
    const currentEMA = ema[ema.length - 1];

    if (currentSMA === 0 || currentEMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromSMA = ((currentPrice - currentSMA) / currentSMA) * 100;
    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

    // POSITION MANAGEMENT: If we have a position, manage it
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Take profit at 2% - ONLY EXIT CONDITION #1
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Grid TP: +${profitPercent.toFixed(2)}% (EMA: ${distanceFromEMA.toFixed(2)}%)`
        };
      }

      // Stop loss at 2% - ONLY EXIT CONDITION #2
      if (profitPercent <= -this.stopLossPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Grid SL: ${profitPercent.toFixed(2)}% (${distanceFromSMA.toFixed(2)}% vs SMA)`
        };
      }

      // HOLD position - let it run to TP or SL
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Grid: ${profitPercent.toFixed(2)}% (${distanceFromSMA.toFixed(2)}% from SMA, TP: +${this.takeProfitPercent}%)`
      };
    }

    // TREND FILTER: Only trade if in uptrend (price > EMA50)
    const isUptrend = currentPrice > currentEMA;

    if (!isUptrend && !this.inPosition) {
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Grid PAUSED: Downtrend (${distanceFromEMA.toFixed(2)}% below EMA50) - waiting for uptrend`
      };
    }

    // ENTRY: Buy when price dips below SMA BUT still above EMA50 (dip in uptrend)
    const isBelowSMA = currentPrice < currentSMA;
    const isDipInUptrend = isBelowSMA && isUptrend;

    if (isDipInUptrend && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 2% target
      // Risk/Reward = 1:1 (but high win rate compensates)

      this.inPosition = true;
      this.entryPrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Grid BUY: Dip in uptrend (SMA: ${distanceFromSMA.toFixed(2)}%, EMA: +${distanceFromEMA.toFixed(2)}%) [1:1 R:R]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for dip in uptrend';

    if (isUptrend && !isBelowSMA) {
      reason = `Uptrend but above SMA (+${distanceFromSMA.toFixed(2)}%), waiting for dip`;
    } else if (isUptrend && isBelowSMA) {
      reason = `Good setup: ${distanceFromSMA.toFixed(2)}% below SMA in uptrend`;
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
