import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * RELAXED BREAKOUT STRATEGY
 *
 * Simpler version with fewer conditions to actually generate trades.
 * Uses 4H timeframe for meaningful breakouts.
 *
 * Entry conditions:
 * 1. Price breaks above recent high (20 periods)
 * 2. RSI between 50-70 (momentum but not overbought)
 * 3. Volume above average
 *
 * Uses high R:R (1:3) to overcome costs.
 */
export class RelaxedBreakoutStrategy extends BaseStrategy {
  // Timeframe: 4H
  private readonly candlesPer4H: number = 240;

  // Indicators
  private readonly lookbackPeriod: number = 20;
  private readonly emaFast: number = 10;
  private readonly emaSlow: number = 21;
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds
  private readonly rsiMin: number = 50;
  private readonly rsiMax: number = 70;
  private readonly minVolumeRatio: number = 1.0;

  // Risk Management - HIGH R:R
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 6.0; // 1:3 R:R

  constructor() {
    super('RelaxedBreakout');
  }

  private resampleTo4H(candles: Candle[]): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + this.candlesPer4H <= candles.length; i += this.candlesPer4H) {
      const slice = candles.slice(i, i + this.candlesPer4H);
      resampled.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return resampled;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.lookbackPeriod + 25) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.lookbackPeriod + 20) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const emaFast = calculateEMA(candles4H, this.emaFast);
    const emaSlow = calculateEMA(candles4H, this.emaSlow);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const idx = candles4H.length - 1;
    const currentEMAFast = emaFast[idx];
    const currentEMASlow = emaSlow[idx];
    const currentRSI = rsi[idx];
    const currentATR = atr[idx];
    const currentCandle = candles4H[idx];

    if (currentEMAFast === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Find recent high (excluding current candle)
    const recentCandles = candles4H.slice(-this.lookbackPeriod - 1, -1);
    const recentHigh = Math.max(...recentCandles.map(c => c.high));

    // Entry conditions
    // 1. Price breaks above recent high
    const breakout = currentPrice > recentHigh;

    // 2. RSI in momentum range
    const rsiOK = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 3. Volume confirmation
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 4. Trend confirmation (EMA alignment)
    const trendUp = currentEMAFast > currentEMASlow;

    // 5. Bullish candle
    const bullishCandle = currentCandle.close > currentCandle.open;

    // ENTRY - reduced conditions
    const hasEntry = breakout && rsiOK && trendUp && (hasVolume || bullishCandle);

    if (hasEntry) {
      const stopLoss = currentPrice - (currentATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (currentATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `BREAKOUT: Above ${recentHigh.toFixed(0)} | RSI ${currentRSI.toFixed(0)} | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!breakout) reason = `No breakout (high: ${recentHigh.toFixed(0)})`;
    else if (!rsiOK) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!trendUp) reason = 'Trend down';
    else if (!hasVolume && !bullishCandle) reason = 'No confirmation';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
