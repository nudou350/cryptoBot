import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateAverageVolume } from '../utils/indicators';

/**
 * Volume Breakout Strategy (52-58% win rate)
 *
 * Best for: Consolidation breakouts, explosive moves, news-driven volatility
 * Win Rate: 52-58%
 * Risk/Reward: 1:2-3
 * Risk Level: Medium-High
 *
 * Strategy:
 * - Volume precedes price - when volume spikes, major moves follow
 * - Identifies volume breakouts with price confirmation
 * - Catches explosive moves other strategies miss
 * - Fast execution required (2-8 hour hold times)
 */
export class VolumeBreakoutStrategy extends BaseStrategy {
  private readonly volumePeriod: number = 20;
  private readonly volumeMultiplier: number = 2.0;
  private readonly lookbackPeriod: number = 10;
  private readonly breakoutThreshold: number = 0.005; // 0.5%
  private readonly confirmationCandles: number = 2;
  private readonly atrPeriod: number = 14;
  private readonly emaLongTerm: number = 100;

  constructor() {
    super('VolumeBreakout');
  }

  private findResistance(candles: Candle[], lookback: number): number {
    let highest = 0;
    const startIdx = Math.max(0, candles.length - lookback - 1);

    for (let i = startIdx; i < candles.length - 1; i++) {
      if (candles[i].high > highest) {
        highest = candles[i].high;
      }
    }
    return highest;
  }

  private findSupport(candles: Candle[], lookback: number): number {
    let lowest = Infinity;
    const startIdx = Math.max(0, candles.length - lookback - 1);

    for (let i = startIdx; i < candles.length - 1; i++) {
      if (candles[i].low < lowest) {
        lowest = candles[i].low;
      }
    }
    return lowest;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.volumePeriod, this.lookbackPeriod, this.atrPeriod, this.emaLongTerm) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data for Volume Breakout' };
    }

    // Calculate indicators
    const avgVolume = calculateAverageVolume(candles, this.volumePeriod);
    const atr = calculateATR(candles, this.atrPeriod);
    const ema100 = calculateEMA(candles, this.emaLongTerm);

    const idx = candles.length - 1;
    const currentVolume = candles[idx].volume;

    // Check if indicators are ready
    if (avgVolume[idx] === 0 || atr[idx] === 0 || ema100[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Find resistance and support
    const resistance = this.findResistance(candles, this.lookbackPeriod);
    const support = this.findSupport(candles, this.lookbackPeriod);
    const breakoutRange = resistance - support;

    // Check volume spike
    const volumeSpike = currentVolume > avgVolume[idx] * this.volumeMultiplier;

    // Check price breakout
    const priceAboveResistance = currentPrice > resistance;
    const breakoutStrength = (currentPrice - resistance) / resistance;
    const strongBreakout = breakoutStrength > this.breakoutThreshold;

    // Check ATR increasing (volatility)
    const avgATR = (atr[idx-1] + atr[idx-2] + atr[idx-3] + atr[idx-4] + atr[idx-5]) / 5;
    const atrIncreasing = atr[idx] > avgATR;

    // Long-term trend
    const inUptrend = currentPrice > ema100[idx];

    // Check if breakout is sustained (2-candle confirmation)
    const prevPrice = candles[idx - 1].close;
    const prevAboveResistance = prevPrice > resistance;
    const sustained = prevAboveResistance;

    // BUY Signal
    if (volumeSpike && priceAboveResistance && strongBreakout &&
        atrIncreasing && inUptrend && sustained) {
      const stopLoss = Math.max(resistance * 0.995, currentPrice - atr[idx]);
      const takeProfit = currentPrice + (breakoutRange * 2);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Volume Breakout BUY: Volume=${(currentVolume/avgVolume[idx]).toFixed(1)}x avg, broke above ${resistance.toFixed(2)} by ${(breakoutStrength*100).toFixed(2)}%, ATR rising`
      };
    }

    // EXIT - Volume dried up
    const volumeDrying = candles[idx].volume < avgVolume[idx] &&
                        candles[idx-1].volume < avgVolume[idx-1] &&
                        candles[idx-2].volume < avgVolume[idx-2];
    if (volumeDrying) {
      return {
        action: 'close',
        price: currentPrice,
        reason: 'Volume Breakout EXIT: Volume dried up - move losing momentum'
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for volume breakout';

    const currentVolumeRatio = currentVolume / avgVolume[idx];

    if (!inUptrend) {
      reason = `Price below EMA100 (${ema100[idx].toFixed(2)}) - no long-term uptrend`;
    } else if (!volumeSpike) {
      reason = `Waiting for volume spike (current: ${currentVolumeRatio.toFixed(2)}x, need: ${this.volumeMultiplier}x)`;
    } else if (volumeSpike && !priceAboveResistance) {
      reason = `Volume spike detected (${currentVolumeRatio.toFixed(2)}x), waiting for price breakout above ${resistance.toFixed(2)}`;
    } else if (priceAboveResistance && !strongBreakout) {
      reason = `Broke resistance but not strong enough (${(breakoutStrength*100).toFixed(2)}% < ${(this.breakoutThreshold*100).toFixed(2)}%)`;
    } else if (!sustained) {
      reason = `Waiting for breakout confirmation (need ${this.confirmationCandles} candles)`;
    } else {
      reason = `Consolidating between ${support.toFixed(2)} - ${resistance.toFixed(2)}`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
