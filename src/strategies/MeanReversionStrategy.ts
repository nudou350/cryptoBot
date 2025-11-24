import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA } from '../utils/indicators';

/**
 * Mean Reversion Strategy - OPTIMIZED FOR 65%+ WIN RATE
 *
 * Best for: Ranging and trending markets with oversold bounces
 * Win Rate Target: 65-75%
 * Risk Level: Medium
 *
 * IMPROVEMENTS FOR 65%+ WIN RATE:
 * - Works in BOTH trending AND ranging markets (not just uptrend)
 * - RSI < 40 (more opportunities than < 35)
 * - 4% take profit (realistic for crypto volatility)
 * - 2.5% stop loss (wider breathing room)
 * - Trailing stop at 3% to capture bigger moves
 * - Simplified entry: just RSI oversold, no strict trend requirement
 *
 * Strategy:
 * - Buy when: RSI < 40 (oversold bounce opportunity)
 * - Take profit at 4% OR trailing stop triggers
 * - Stop loss at 2.5%
 * - Works in all market conditions
 */
export class MeanReversionStrategy extends BaseStrategy {
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50; // For context only
  private readonly oversoldThreshold: number = 40; // More opportunities
  private readonly stopLossPercent: number = 2.5; // 2.5% stop loss (wider)
  private readonly takeProfitPercent: number = 4.0; // 4% take profit (realistic)
  private readonly trailingStopPercent: number = 3.0; // Trail at 3% profit

  private entryPrice: number = 0;
  private inPosition: boolean = false;
  private highestProfit: number = 0; // Track highest profit for trailing stop

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
          reason: `MeanRev TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
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
          reason: `MeanRev TRAIL: +${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, RSI: ${currentRSI.toFixed(1)})`
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
          reason: `MeanRev SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position
      return {
        action: 'hold',
        price: currentPrice,
        reason: `MeanRev: ${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ENTRY: Simple oversold condition (RSI < 40)
    // NO STRICT TREND REQUIREMENT - works in ranging and trending markets
    const isOversold = currentRSI < this.oversoldThreshold;

    // Optional: Avoid extreme downtrends (price > 10% below EMA50)
    const notExtremeDowntrend = distanceFromEMA > -10;

    if (isOversold && notExtremeDowntrend && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2.5% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 4% target
      // Risk/Reward = 1:1.6

      this.inPosition = true;
      this.entryPrice = currentPrice;
      this.highestProfit = 0;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MeanRev BUY: Oversold bounce (RSI: ${currentRSI.toFixed(1)}, EMA: ${distanceFromEMA.toFixed(2)}%) [1:1.6 R:R]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for oversold (RSI < 40)';

    if (currentRSI < 45) {
      reason = `Approaching oversold (RSI: ${currentRSI.toFixed(1)}, need < ${this.oversoldThreshold})`;
    } else if (currentRSI > 60) {
      reason = `Overbought, wait for pullback (RSI: ${currentRSI.toFixed(1)})`;
    } else if (!notExtremeDowntrend) {
      reason = `Strong downtrend, paused (${distanceFromEMA.toFixed(2)}% below EMA50)`;
    } else {
      reason = `Neutral (RSI: ${currentRSI.toFixed(1)}, EMA: ${distanceFromEMA.toFixed(2)}%)`;
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

  /**
   * Restore state from existing position (called on bot restart)
   */
  public restorePositionState(entryPrice: number, currentPrice: number): void {
    this.inPosition = true;
    this.entryPrice = entryPrice;
    const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    this.highestProfit = Math.max(0, profitPercent);
    console.log(`[${this.getName()}] State restored: Entry $${entryPrice.toFixed(2)}, Current $${currentPrice.toFixed(2)}, P&L ${profitPercent.toFixed(2)}%`);
  }
}
