import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateADX, calculateATR, calculateAverageVolume } from '../utils/indicators';

/**
 * EMA Crossover Strategy (55-60% win rate)
 *
 * Best for: Trending markets, breakout confirmations
 * Win Rate: 55-60%
 * Risk/Reward: 1:2
 * Risk Level: Medium
 *
 * Strategy:
 * - Buy when fast EMA(9) crosses above slow EMA(21) with ADX > 20 and volume confirmation
 * - Sell when fast EMA crosses below slow EMA
 * - Uses ATR for dynamic stop loss and take profit
 * - Only trades when market is trending (ADX filter)
 */
export class EMACrossoverStrategy extends BaseStrategy {
  private readonly fastPeriod: number = 9;
  private readonly slowPeriod: number = 21;
  private readonly volumePeriod: number = 20;
  private readonly adxPeriod: number = 14;
  private readonly atrPeriod: number = 14;
  private readonly volumeMultiplier: number = 1.2;
  private readonly adxThreshold: number = 20;
  private readonly atrMultiplierTP: number = 2.0;
  private readonly atrMultiplierSL: number = 1.0;

  constructor() {
    super('EMACrossover');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.slowPeriod, this.volumePeriod, this.adxPeriod, this.atrPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data for EMA Crossover' };
    }

    // Calculate indicators
    const fastEMA = calculateEMA(candles, this.fastPeriod);
    const slowEMA = calculateEMA(candles, this.slowPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const atr = calculateATR(candles, this.atrPeriod);
    const avgVolume = calculateAverageVolume(candles, this.volumePeriod);

    const idx = candles.length - 1;
    const prevIdx = idx - 1;

    // Check if indicators are ready
    if (fastEMA[idx] === 0 || slowEMA[idx] === 0 || adx[idx] === 0 || atr[idx] === 0 || avgVolume[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Current and previous values
    const currentFast = fastEMA[idx];
    const currentSlow = slowEMA[idx];
    const prevFast = fastEMA[prevIdx];
    const prevSlow = slowEMA[prevIdx];

    // Detect crossovers
    const bullishCross = prevFast <= prevSlow && currentFast > currentSlow;
    const bearishCross = prevFast >= prevSlow && currentFast < currentSlow;

    // Check filters
    const isTrending = adx[idx] > this.adxThreshold;
    const hasVolume = candles[idx].volume > avgVolume[idx] * this.volumeMultiplier;
    const priceAboveSlow = currentPrice > currentSlow;

    // BUY Signal
    if (bullishCross && isTrending && hasVolume && priceAboveSlow) {
      const stopLoss = currentPrice - atr[idx] * this.atrMultiplierSL;
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `EMA Crossover BUY: Fast(${currentFast.toFixed(2)}) > Slow(${currentSlow.toFixed(2)}), ADX=${adx[idx].toFixed(1)}, Vol=${(candles[idx].volume/avgVolume[idx]).toFixed(2)}x`
      };
    }

    // CLOSE Signal - Bearish crossover
    if (bearishCross) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `EMA Crossover EXIT: Fast(${currentFast.toFixed(2)}) crossed below Slow(${currentSlow.toFixed(2)})`
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for EMA crossover';
    const fastAboveSlow = currentFast > currentSlow;

    if (fastAboveSlow && isTrending) {
      reason = `Uptrend active (Fast > Slow, ADX=${adx[idx].toFixed(1)})`;
    } else if (!fastAboveSlow && isTrending) {
      reason = `Downtrend active (Fast < Slow, ADX=${adx[idx].toFixed(1)})`;
    } else if (!isTrending) {
      reason = `Market ranging (ADX=${adx[idx].toFixed(1)} < ${this.adxThreshold})`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
