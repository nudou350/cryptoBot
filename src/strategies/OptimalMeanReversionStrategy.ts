import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMAL Mean Reversion Strategy
 *
 * Based on analysis: Hourly resampling works but win rate too low.
 *
 * OPTIMIZATIONS:
 * 1. Wider stops (2%) to avoid noise-triggered exits
 * 2. Smaller take profit (3%) for more realistic 1:1.5 R:R
 * 3. Relaxed entry conditions for better entry timing
 *
 * TARGET: 50%+ win rate with 1:1.5 R:R
 * Math: 0.50 * 3% - 0.50 * 2% - 0.35% = 1.5% - 1% - 0.35% = +0.15% per trade
 */
export class OptimalMeanReversionStrategy extends BaseStrategy {
  // Indicators (on hourly data)
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 20;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // Entry thresholds - RELAXED
  private readonly rsiOversold: number = 40; // More generous threshold
  private readonly rsiMinimum: number = 15;

  // Risk Management - WIDER STOPS
  private readonly stopLossPercent: number = 2.0;
  private readonly takeProfitPercent: number = 3.0; // 1:1.5 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('OptimalMeanReversion');
  }

  private resampleToHourly(candles: Candle[]): Candle[] {
    const hourlyCandles: Candle[] = [];
    for (let i = 0; i + this.candlesPerHour <= candles.length; i += this.candlesPerHour) {
      const slice = candles.slice(i, i + this.candlesPerHour);
      hourlyCandles.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return hourlyCandles;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.emaPeriod + 10) * this.candlesPerHour;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const hourly = this.resampleToHourly(candles);
    if (hourly.length < this.emaPeriod + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough hourly candles' };
    }

    // Indicators on hourly
    const rsi = calculateRSI(hourly, this.rsiPeriod);
    const ema = calculateEMA(hourly, this.emaPeriod);
    const bb = calculateBollingerBands(hourly, this.bbPeriod, this.bbStdDev);

    const idx = hourly.length - 1;
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentEMA = ema[idx];
    const currentBBLower = bb.lower[idx];
    const currentBBMiddle = bb.middle[idx];
    const hourCandle = hourly[idx];

    if (currentRSI === 0 || currentEMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;
    const distanceFromBBMiddle = ((currentPrice - currentBBMiddle) / currentBBMiddle) * 100;

    // ═══════════════════════════════════════════════════════════
    // RELAXED ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. RSI oversold (relaxed)
    const isOversold = currentRSI <= this.rsiOversold && currentRSI >= this.rsiMinimum;

    // 2. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 3. Price below BB middle (not necessarily at lower band)
    const belowBBMiddle = distanceFromBBMiddle < 0;

    // 4. Not crashing
    const notCrashing = distanceFromEMA > -6;

    // ENTRY - Simplified conditions
    const hasEntry = isOversold && rsiTurningUp && belowBBMiddle && notCrashing;

    if (hasEntry) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `OptMR BUY: RSI ${currentRSI.toFixed(1)} | BB ${distanceFromBBMiddle.toFixed(1)}% [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    let reason = 'Waiting';
    if (!isOversold) reason = `RSI ${currentRSI.toFixed(1)} > ${this.rsiOversold}`;
    else if (!rsiTurningUp) reason = 'RSI falling';
    else if (!belowBBMiddle) reason = 'Above BB middle';
    else if (!notCrashing) reason = 'Crash mode';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
