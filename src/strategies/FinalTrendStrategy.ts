import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, getVolumeRatio } from '../utils/indicators';

/**
 * FINAL Trend Strategy - OPTIMIZED FOR PROFITABILITY
 *
 * Based on OptimalTrend success (+0.54%), this version aims for better returns.
 *
 * IMPROVEMENTS:
 * 1. Higher R:R (1:2.5) to increase profit per winning trade
 * 2. Better entry timing with RSI confirmation
 * 3. Volume filter for higher quality entries
 *
 * TARGET: 35%+ win rate with 1:2.5 R:R
 * Math: 0.35 * 6% - 0.65 * 2.4% - 0.35% = 2.1% - 1.56% - 0.35% = +0.19% per trade
 *
 * With 6.5 trades/month = +1.24%/month = +14.8%/year
 */
export class FinalTrendStrategy extends BaseStrategy {
  // EMAs (on hourly)
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;

  // Entry thresholds
  private readonly rsiMin: number = 45;
  private readonly rsiMax: number = 65;

  // Risk Management - HIGHER R:R
  private readonly stopLossPercent: number = 2.4;
  private readonly takeProfitPercent: number = 6.0; // 1:2.5 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('FinalTrend');
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
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. Bullish EMA stack
    const bullishStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 2. Price above EMA fast (strong momentum)
    const priceAboveEMA = currentPrice > emaFast;

    // 3. RSI in healthy range (not overbought)
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. RSI momentum up
    const rsiUp = currentRSI > prevRSI;

    // 5. Bullish hourly candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // 6. Volume confirmation
    const hasVolume = volumeRatio >= 0.9;

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
        reason: `FTrend BUY: EMA stack | RSI ${currentRSI.toFixed(1)} | Vol ${volumeRatio.toFixed(1)}x [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
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
