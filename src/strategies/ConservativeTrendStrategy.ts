import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, getVolumeRatio } from '../utils/indicators';

/**
 * CONSERVATIVE TREND STRATEGY
 *
 * Based on FinalTrend but with relaxed RSI to get MORE trades.
 * More trades = more opportunity to compound returns.
 *
 * Changes:
 * - RSI range 40-70 (wider)
 * - Volume threshold 0.8 (lower)
 * - Same R:R as FinalTrend (1:2.5)
 *
 * Hourly timeframe
 */
export class ConservativeTrendStrategy extends BaseStrategy {
  // EMAs (on hourly)
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;

  // Entry thresholds - MORE RELAXED
  private readonly rsiMin: number = 40;
  private readonly rsiMax: number = 70;
  private readonly minVolumeRatio: number = 0.8;

  // Risk Management - Same as FinalTrend
  private readonly stopLossPercent: number = 2.4;
  private readonly takeProfitPercent: number = 6.0; // 1:2.5 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('ConservativeTrend');
  }

  private resampleToHourly(candles: Candle[]): Candle[] {
    const hourly: Candle[] = [];
    for (let i = 0; i + this.candlesPerHour <= candles.length; i += this.candlesPerHour) {
      const slice = candles.slice(i, i + this.candlesPerHour);
      hourly.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return hourly;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.emaSlow + 10) * this.candlesPerHour;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const hourly = this.resampleToHourly(candles);
    if (hourly.length < this.emaSlow + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough hourly data' };
    }

    // Indicators on hourly
    const emaFastArr = calculateEMA(hourly, this.emaFast);
    const emaMediumArr = calculateEMA(hourly, this.emaMedium);
    const emaSlowArr = calculateEMA(hourly, this.emaSlow);
    const rsi = calculateRSI(hourly, this.rsiPeriod);
    const volumeRatio = getVolumeRatio(hourly, 10);

    const idx = hourly.length - 1;
    const emaFast = emaFastArr[idx];
    const emaMedium = emaMediumArr[idx];
    const emaSlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const hourCandle = hourly[idx];

    if (emaFast === 0 || emaMedium === 0 || emaSlow === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS (relaxed)
    // ═══════════════════════════════════════════════════════════

    // 1. Bullish EMA stack
    const bullishStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 2. Price above EMA fast
    const priceAboveEMA = currentPrice > emaFast;

    // 3. RSI in range (relaxed)
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. RSI momentum up
    const rsiUp = currentRSI > prevRSI;

    // 5. Bullish candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // 6. Volume (relaxed)
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // ENTRY
    const hasEntry = bullishStack && priceAboveEMA && rsiHealthy && rsiUp && bullishCandle && hasVolume;

    if (hasEntry) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `CTrend: EMA stack | RSI ${currentRSI.toFixed(1)} | Vol ${volumeRatio.toFixed(1)}x`
      };
    }

    let reason = 'Waiting';
    if (!bullishStack) reason = 'No EMA stack';
    else if (!priceAboveEMA) reason = 'Below EMA';
    else if (!rsiHealthy) reason = `RSI ${currentRSI.toFixed(1)} out of range`;
    else if (!rsiUp) reason = 'RSI falling';
    else if (!bullishCandle) reason = 'Bearish candle';
    else if (!hasVolume) reason = `Low volume (${volumeRatio.toFixed(1)}x)`;

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
