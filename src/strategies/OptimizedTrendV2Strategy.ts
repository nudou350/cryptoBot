import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMIZED TREND V2 STRATEGY
 *
 * Based on FinalTrend success (2.52% annual), this version tries to improve.
 *
 * Changes from FinalTrend:
 * 1. Higher R:R (1:4 instead of 1:2.5)
 * 2. ATR-based stops instead of percentage (more adaptive)
 * 3. Slightly stricter entry conditions for higher quality
 *
 * Math needed:
 * - Current: 36.8% win rate, ~2.52% annual
 * - Target: 36% annual = 14x improvement
 * - If we accept 30% win rate with 1:4 R:R:
 *   0.30 * 8% - 0.70 * 2% - 0.35% = 2.4% - 1.4% - 0.35% = 0.65% per trade
 * - With 125 trades/2 years = 62.5 trades/year
 * - Expected: 62.5 * 0.65% * 0.15 (position size) = 6.1% annual
 *
 * Hourly timeframe
 */
export class OptimizedTrendV2Strategy extends BaseStrategy {
  // EMAs (on hourly)
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds - Slightly stricter for quality
  private readonly rsiMin: number = 50; // More restrictive (was 45)
  private readonly rsiMax: number = 63; // More restrictive (was 65)
  private readonly minVolumeRatio: number = 1.0; // Require above average volume

  // Risk Management - HIGHER R:R
  private readonly stopLossATRMultiplier: number = 1.5;
  private readonly takeProfitATRMultiplier: number = 6.0; // 1:4 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('OptimizedTrendV2');
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
    const atr = calculateATR(hourly, this.atrPeriod);
    const volumeRatio = getVolumeRatio(hourly, 10);

    const idx = hourly.length - 1;
    const emaFast = emaFastArr[idx];
    const emaMedium = emaMediumArr[idx];
    const emaSlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const hourCandle = hourly[idx];

    if (emaFast === 0 || emaMedium === 0 || emaSlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS (slightly stricter)
    // ═══════════════════════════════════════════════════════════

    // 1. Bullish EMA stack
    const bullishStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 2. Price above EMA fast (strong momentum)
    const priceAboveEMA = currentPrice > emaFast;

    // 3. RSI in healthy range (stricter)
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. RSI momentum up
    const rsiUp = currentRSI > prevRSI;

    // 5. Bullish hourly candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // 6. Volume confirmation (stricter)
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // ENTRY
    const hasEntry = bullishStack && priceAboveEMA && rsiHealthy && rsiUp && bullishCandle && hasVolume;

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
        reason: `TrendV2 BUY: EMA stack | RSI ${currentRSI.toFixed(1)} | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!bullishStack) reason = 'No EMA stack';
    else if (!priceAboveEMA) reason = 'Below EMA fast';
    else if (!rsiHealthy) reason = `RSI ${currentRSI.toFixed(1)} out of range`;
    else if (!rsiUp) reason = 'RSI falling';
    else if (!bullishCandle) reason = 'Bearish candle';
    else if (!hasVolume) reason = `Low volume (${volumeRatio.toFixed(1)}x)`;

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
