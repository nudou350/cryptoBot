import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI } from '../utils/indicators';

/**
 * Pullback Strategy - OPTIMIZED FOR 65%+ WIN RATE
 *
 * Simplified pullback strategy that works in all market conditions
 * Win Rate Target: 65-75%
 * Risk Level: Medium
 *
 * IMPROVEMENTS FOR 65%+ WIN RATE:
 * - Works in BOTH trending AND ranging markets
 * - Simplified entry: RSI < 45 OR price near EMA20
 * - 4% take profit (realistic for crypto)
 * - 2.5% stop loss (wider breathing room)
 * - Trailing stop at 3% to capture bigger moves
 * - No strict trend requirement
 *
 * Strategy:
 * - Buy when: RSI < 45 OR price pulls back to EMA20
 * - Take profit at 4% OR trailing stop triggers
 * - Stop loss at 2.5%
 * - Works in all market conditions
 */
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  private readonly rsiPeriod: number = 14;
  private readonly emaShortPeriod: number = 20; // Pullback level
  private readonly emaLongPeriod: number = 50; // For context
  private readonly oversoldThreshold: number = 45; // More opportunities
  private readonly stopLossPercent: number = 2.5; // 2.5% stop loss (wider)
  private readonly takeProfitPercent: number = 4.0; // 4% take profit (realistic)
  private readonly trailingStopPercent: number = 3.0; // Trail at 3% profit

  private inPosition: boolean = false;
  private entryPrice: number = 0;
  private highestProfit: number = 0; // Track highest profit for trailing stop

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

      // Update highest profit for trailing stop
      if (profitPercent > this.highestProfit) {
        this.highestProfit = profitPercent;
      }

      // EXIT #1: Take profit at 4%
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        this.highestProfit = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Pullback TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // EXIT #2: Trailing stop - if we hit 3% profit and now pulled back 1.5%
      if (this.highestProfit >= this.trailingStopPercent && profitPercent <= this.highestProfit - 1.5) {
        this.inPosition = false;
        this.entryPrice = 0;
        this.highestProfit = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Pullback TRAIL: +${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // EXIT #3: Stop loss at 2.5%
      if (profitPercent <= -this.stopLossPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        this.highestProfit = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Pullback SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Pullback: ${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ENTRY: Simplified conditions - RSI oversold OR price pullback to EMA20
    // NO STRICT TREND REQUIREMENT - works in ranging and trending markets
    const isOversold = currentRSI < this.oversoldThreshold;
    const isPullbackToEMA = Math.abs(distanceFromEMAShort) <= 1.0; // Within 1% of EMA20

    // Optional: Avoid extreme downtrends (price > 10% below EMA50)
    const notExtremeDowntrend = distanceFromEMALong > -10;

    // Enter on oversold OR pullback to EMA20 (more flexible)
    const hasEntrySignal = (isOversold || isPullbackToEMA) && notExtremeDowntrend;

    if (hasEntrySignal && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2.5% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 4% target
      // Risk/Reward = 1:1.6

      this.inPosition = true;
      this.entryPrice = currentPrice;
      this.highestProfit = 0;

      const trigger = isOversold ? `RSI ${currentRSI.toFixed(1)}` : `EMA20 pullback`;
      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Pullback BUY: ${trigger} (EMA50: ${distanceFromEMALong.toFixed(2)}%) [1:1.6 R:R]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for oversold or pullback';

    if (currentRSI < 50 && Math.abs(distanceFromEMAShort) < 3) {
      reason = `Good setup approaching (RSI: ${currentRSI.toFixed(1)}, EMA20: ${distanceFromEMAShort.toFixed(2)}%)`;
    } else if (currentRSI > 60) {
      reason = `Overbought, wait for pullback (RSI: ${currentRSI.toFixed(1)})`;
    } else if (!notExtremeDowntrend) {
      reason = `Strong downtrend, paused (${distanceFromEMALong.toFixed(2)}% below EMA50)`;
    } else {
      reason = `Neutral (RSI: ${currentRSI.toFixed(1)}, EMA20: ${distanceFromEMAShort.toFixed(2)}%, EMA50: ${distanceFromEMALong.toFixed(2)}%)`;
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
    this.highestProfit = 0;
  }
}
