import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, getVolumeRatio } from '../utils/indicators';

/**
 * AGGRESSIVE HIGH R:R STRATEGY
 *
 * More trades than UltraHighRR but still with 1:5 R:R.
 * Relaxed conditions to generate more signals.
 *
 * Math with 30% win rate, 1:5 R:R:
 * 0.30 * 10% - 0.70 * 2% - 0.35% = 3% - 1.4% - 0.35% = 1.25% per trade
 *
 * If we get 150 trades over 2 years:
 * 150 * 1.25% * 0.15 = 28% annual (closer to target!)
 *
 * Hourly timeframe, minimal conditions
 */
export class AggressiveHighRRStrategy extends BaseStrategy {
  // EMAs (on hourly)
  private readonly emaFast: number = 10;
  private readonly emaSlow: number = 30;

  // Other indicators
  private readonly rsiPeriod: number = 14;

  // Entry thresholds - VERY RELAXED
  private readonly rsiMin: number = 45;
  private readonly rsiMax: number = 70;

  // Risk Management - HIGH R:R
  private readonly stopLossPercent: number = 2.0;
  private readonly takeProfitPercent: number = 10.0; // 1:5 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('AggressiveHighRR');
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
    const emaSlowArr = calculateEMA(hourly, this.emaSlow);
    const rsi = calculateRSI(hourly, this.rsiPeriod);
    const volumeRatio = getVolumeRatio(hourly, 10);

    const idx = hourly.length - 1;
    const emaFast = emaFastArr[idx];
    const emaSlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const hourCandle = hourly[idx];

    if (emaFast === 0 || emaSlow === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS (minimal)
    // ═══════════════════════════════════════════════════════════

    // 1. EMA uptrend
    const uptrend = emaFast > emaSlow;

    // 2. Price above EMA fast
    const priceAboveEMA = currentPrice > emaFast;

    // 3. RSI in range
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. Bullish candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // ENTRY - minimal conditions
    const hasEntry = uptrend && priceAboveEMA && rsiHealthy && bullishCandle;

    if (hasEntry) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `AggHR: Uptrend | RSI ${currentRSI.toFixed(0)} | SL -${this.stopLossPercent}% TP +${this.takeProfitPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!uptrend) reason = 'No uptrend';
    else if (!priceAboveEMA) reason = 'Below EMA';
    else if (!rsiHealthy) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!bullishCandle) reason = 'Bearish candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
