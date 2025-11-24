import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA, calculateEMA } from '../utils/indicators';

/**
 * Grid Trading Strategy - OPTIMIZED FOR 65%+ WIN RATE
 *
 * Best for: Ranging and trending markets with dips
 * Win Rate Target: 65-75%
 * Risk Level: Low-Medium
 *
 * IMPROVEMENTS FOR 65%+ WIN RATE:
 * - Works in BOTH trending AND ranging markets
 * - Buys dips: price 0.5-2% below SMA20 (sweet spot)
 * - 3.5% take profit (realistic for crypto)
 * - 2.5% stop loss (wider breathing room)
 * - Trailing stop at 2.5% to capture bigger moves
 * - No strict trend requirement (just avoid extreme downtrends)
 *
 * Strategy:
 * - Buy when: price dips 0.5-2% below SMA20
 * - Take profit at 3.5% OR trailing stop triggers
 * - Stop loss at 2.5%
 * - Works in all market conditions
 */
export class GridTradingStrategy extends BaseStrategy {
  private readonly smaPeriod: number = 20;
  private readonly emaPeriod: number = 50; // For context
  private readonly stopLossPercent: number = 2.5; // 2.5% stop loss (wider)
  private readonly takeProfitPercent: number = 3.5; // 3.5% take profit (realistic)
  private readonly trailingStopPercent: number = 2.5; // Trail at 2.5% profit

  private inPosition: boolean = false;
  private entryPrice: number = 0;
  private highestProfit: number = 0; // Track highest profit for trailing stop

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

      // Update highest profit for trailing stop
      if (profitPercent > this.highestProfit) {
        this.highestProfit = profitPercent;
      }

      // EXIT #1: Take profit at 3.5%
      if (profitPercent >= this.takeProfitPercent) {
        this.inPosition = false;
        this.entryPrice = 0;
        this.highestProfit = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Grid TP: +${profitPercent.toFixed(2)}% (SMA: ${distanceFromSMA.toFixed(2)}%)`
        };
      }

      // EXIT #2: Trailing stop - if we hit 2.5% profit and now pulled back 1.5%
      if (this.highestProfit >= this.trailingStopPercent && profitPercent <= this.highestProfit - 1.5) {
        this.inPosition = false;
        this.entryPrice = 0;
        this.highestProfit = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `Grid TRAIL: +${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%)`
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
          reason: `Grid SL: ${profitPercent.toFixed(2)}% (SMA: ${distanceFromSMA.toFixed(2)}%)`
        };
      }

      // HOLD position
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Grid: ${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, SMA: ${distanceFromSMA.toFixed(2)}%, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ENTRY: Buy dips 0.5-2% below SMA20 (sweet spot for bounces)
    // NO STRICT TREND REQUIREMENT - works in ranging and trending markets
    const isDipBelowSMA = distanceFromSMA >= -2.0 && distanceFromSMA <= -0.5;

    // Optional: Avoid extreme downtrends (price > 10% below EMA50)
    const notExtremeDowntrend = distanceFromEMA > -10;

    if (isDipBelowSMA && notExtremeDowntrend && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100); // 2.5% stop
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100); // 3.5% target
      // Risk/Reward = 1:1.4

      this.inPosition = true;
      this.entryPrice = currentPrice;
      this.highestProfit = 0;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Grid BUY: Dip bounce (SMA: ${distanceFromSMA.toFixed(2)}%, EMA: ${distanceFromEMA.toFixed(2)}%) [1:1.4 R:R]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for dip (0.5-2% below SMA)';

    if (distanceFromSMA > 0) {
      reason = `Above SMA (+${distanceFromSMA.toFixed(2)}%), waiting for dip`;
    } else if (distanceFromSMA < -2) {
      reason = `Too far below SMA (${distanceFromSMA.toFixed(2)}%), waiting for bounce closer`;
    } else if (distanceFromSMA > -0.5) {
      reason = `Near SMA (${distanceFromSMA.toFixed(2)}%), need dip to -0.5% to -2%`;
    } else if (!notExtremeDowntrend) {
      reason = `Strong downtrend, paused (${distanceFromEMA.toFixed(2)}% below EMA50)`;
    } else {
      reason = `SMA: ${distanceFromSMA.toFixed(2)}%, EMA: ${distanceFromEMA.toFixed(2)}%`;
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
