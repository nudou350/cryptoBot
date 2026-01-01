import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * FINAL Mean Reversion Strategy - OPTIMIZED FOR PROFITABILITY
 *
 * Key insight from testing: Need wider stops and better R:R.
 *
 * IMPROVEMENTS:
 * 1. Stricter oversold conditions for higher quality entries
 * 2. Higher R:R (1:2) with wider stops
 * 3. Volume confirmation
 *
 * TARGET: 45%+ win rate with 1:2 R:R
 * Math: 0.45 * 4% - 0.55 * 2% - 0.35% = 1.8% - 1.1% - 0.35% = +0.35% per trade
 */
export class FinalMeanReversionStrategy extends BaseStrategy {
  // Indicators (on hourly)
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 20;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // Entry thresholds - STRICTER for quality
  private readonly rsiOversold: number = 35; // More strict oversold
  private readonly rsiMinimum: number = 18;

  // Risk Management - 1:2 R:R
  private readonly stopLossPercent: number = 2.0;
  private readonly takeProfitPercent: number = 4.0;

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('FinalMeanReversion');
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
    const minCandles = (this.emaPeriod + 10) * this.candlesPerHour;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const hourly = this.resampleToHourly(candles);
    if (hourly.length < this.emaPeriod + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough hourly data' };
    }

    // Indicators on hourly
    const rsi = calculateRSI(hourly, this.rsiPeriod);
    const ema = calculateEMA(hourly, this.emaPeriod);
    const bb = calculateBollingerBands(hourly, this.bbPeriod, this.bbStdDev);
    const volumeRatio = getVolumeRatio(hourly, 10);

    const idx = hourly.length - 1;
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentEMA = ema[idx];
    const currentBBLower = bb.lower[idx];
    const hourCandle = hourly[idx];

    if (currentRSI === 0 || currentEMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. RSI oversold
    const isOversold = currentRSI <= this.rsiOversold && currentRSI >= this.rsiMinimum;

    // 2. RSI turning up (momentum shift)
    const rsiTurningUp = currentRSI > prevRSI;

    // 3. Price at or below BB lower
    const atBBLower = currentPrice <= currentBBLower * 1.01;

    // 4. Not in crash mode
    const notCrashing = distanceFromEMA > -5;

    // 5. Bullish hourly candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // 6. Volume (above average)
    const hasVolume = volumeRatio >= 1.0;

    // ENTRY
    const hasEntry = isOversold && rsiTurningUp && atBBLower && notCrashing && bullishCandle && hasVolume;

    if (hasEntry) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `FMR BUY: RSI ${currentRSI.toFixed(1)} | BB low | Vol ${volumeRatio.toFixed(1)}x [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    let reason = 'Waiting';
    if (!isOversold) reason = `RSI ${currentRSI.toFixed(1)} > ${this.rsiOversold}`;
    else if (!rsiTurningUp) reason = 'RSI falling';
    else if (!atBBLower) reason = 'Above BB lower';
    else if (!notCrashing) reason = 'Crash mode';
    else if (!bullishCandle) reason = 'Bearish candle';
    else if (!hasVolume) reason = `Low volume (${volumeRatio.toFixed(1)}x)`;

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
