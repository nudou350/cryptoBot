import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateADX, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMAL Trend Strategy
 *
 * Based on analysis: Need higher win rate with decent R:R.
 *
 * OPTIMIZATIONS:
 * 1. Wider stops (2.5%) for trend trades
 * 2. Larger take profit (5%) for 1:2 R:R
 * 3. Simpler entry conditions
 *
 * TARGET: 45%+ win rate with 1:2 R:R
 * Math: 0.45 * 5% - 0.55 * 2.5% - 0.35% = 2.25% - 1.375% - 0.35% = +0.525% per trade
 */
export class OptimalTrendStrategy extends BaseStrategy {
  // EMAs (on hourly)
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;

  // Entry thresholds - RELAXED
  private readonly rsiMin: number = 40;
  private readonly rsiMax: number = 65;

  // Risk Management - WIDER FOR TRENDS
  private readonly stopLossPercent: number = 2.5;
  private readonly takeProfitPercent: number = 5.0; // 1:2 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('OptimalTrend');
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

    const distFromEMAFast = ((currentPrice - emaFast) / emaFast) * 100;

    // ═══════════════════════════════════════════════════════════
    // SIMPLIFIED ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. Bullish EMA stack
    const bullishStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 2. Price above EMA fast
    const priceAboveEMA = currentPrice > emaFast;

    // 3. RSI in healthy range
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. RSI momentum up
    const rsiUp = currentRSI > prevRSI;

    // 5. Bullish hourly candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // ENTRY
    const hasEntry = bullishStack && priceAboveEMA && rsiHealthy && rsiUp && bullishCandle;

    if (hasEntry) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `OptTrend BUY: EMA stack | RSI ${currentRSI.toFixed(1)} [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    let reason = 'Waiting';
    if (!bullishStack) reason = 'No EMA stack';
    else if (!priceAboveEMA) reason = 'Below EMA fast';
    else if (!rsiHealthy) reason = `RSI ${currentRSI.toFixed(1)} out of range`;
    else if (!rsiUp) reason = 'RSI falling';
    else if (!bullishCandle) reason = 'Bearish hour candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
