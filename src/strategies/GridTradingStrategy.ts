import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA } from '../utils/indicators';

/**
 * Grid Trading Strategy - FIXED (Target: 65%+ win rate)
 *
 * Best for: Ranging/sideways markets (most crypto conditions)
 * Win Rate Target: 65-75%
 * Risk Level: Low-Medium
 *
 * FIXES APPLIED:
 * - Removed restrictive distance requirement (was -0.3% from SMA)
 * - Simplified grid to just buy low/sell high around SMA
 * - More frequent entries (buy when price < SMA, no level restrictions)
 * - Clear exits at 3% profit or 2% loss (1:1.5 R:R but high win rate compensates)
 *
 * Strategy:
 * - Buy when price is below 20-period SMA (simple mean reversion)
 * - Exit at 3% profit or 2% loss
 * - Best for choppy/ranging markets where price oscillates around SMA
 */
export class GridTradingStrategy extends BaseStrategy {
  private readonly smaPeriod: number = 20;
  private readonly stopLossPercent: number = 2.0; // 2% stop loss
  private readonly takeProfitPercent: number = 3.0; // 3% take profit (1:1.5 R:R)

  private inPosition: boolean = false;
  private entryPrice: number = 0;

  constructor() {
    super('GridTrading');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = this.smaPeriod + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate SMA
    const sma = calculateSMA(candles, this.smaPeriod);
    const currentSMA = sma[sma.length - 1];

    if (currentSMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'SMA not ready' };
    }

    const distanceFromSMA = ((currentPrice - currentSMA) / currentSMA) * 100;

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
          reason: `Grid TP: +${profitPercent.toFixed(2)}% (${distanceFromSMA.toFixed(2)}% vs SMA)`
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

    // ENTRY: Buy when price is below SMA (simple mean reversion)
    const isBelowSMA = currentPrice < currentSMA;

    if (isBelowSMA && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 3% target
      // Risk/Reward = 1:1.5 (but high win rate compensates)

      this.inPosition = true;
      this.entryPrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Grid BUY: ${distanceFromSMA.toFixed(2)}% below SMA [R:R 1:1.5, SL: -${this.stopLossPercent}%, TP: +${this.takeProfitPercent}%]`
      };
    }

    // HOLD: Waiting for price to drop below SMA
    let reason = 'Waiting for price below SMA';

    if (distanceFromSMA > 1.0) {
      reason = `Above SMA (+${distanceFromSMA.toFixed(2)}%), waiting for dip`;
    } else if (distanceFromSMA > 0) {
      reason = `Near SMA (+${distanceFromSMA.toFixed(2)}%), close to entry`;
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
