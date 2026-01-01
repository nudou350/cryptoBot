import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * HOURLY Mean Reversion Strategy
 *
 * KEY INSIGHT: Use 1-minute data but RESAMPLE to hourly candles for signals.
 * This reduces noise and produces higher-quality signals.
 *
 * APPROACH:
 * 1. Resample 1-min candles to 60-min candles for indicator calculation
 * 2. Look for oversold conditions on HOURLY timeframe
 * 3. Use tighter stops since hourly signals are more reliable
 *
 * TARGET: 55%+ win rate with 1:2 R:R
 * Math: 0.55 * 2% - 0.45 * 1% - 0.35% = 1.1% - 0.45% - 0.35% = +0.30% per trade
 */
export class HourlyMeanReversionStrategy extends BaseStrategy {
  // Indicator periods (on hourly data)
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 20;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // Entry thresholds
  private readonly rsiOversold: number = 35;
  private readonly rsiMinimum: number = 15;

  // Risk Management (percentage-based)
  private readonly stopLossPercent: number = 1.5;
  private readonly takeProfitPercent: number = 3.0; // 1:2 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('HourlyMeanReversion');
  }

  /**
   * Resample 1-minute candles to hourly candles
   */
  private resampleToHourly(candles: Candle[]): Candle[] {
    const hourlyCandles: Candle[] = [];

    for (let i = 0; i + this.candlesPerHour <= candles.length; i += this.candlesPerHour) {
      const hourCandles = candles.slice(i, i + this.candlesPerHour);

      const hourlyCandle: Candle = {
        timestamp: hourCandles[0].timestamp,
        open: hourCandles[0].open,
        high: Math.max(...hourCandles.map(c => c.high)),
        low: Math.min(...hourCandles.map(c => c.low)),
        close: hourCandles[hourCandles.length - 1].close,
        volume: hourCandles.reduce((sum, c) => sum + c.volume, 0)
      };

      hourlyCandles.push(hourlyCandle);
    }

    return hourlyCandles;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    // Need at least enough candles for hourly resampling + indicators
    const minCandles = (this.emaPeriod + 5) * this.candlesPerHour;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Resample to hourly
    const hourlyCandles = this.resampleToHourly(candles);

    if (hourlyCandles.length < this.emaPeriod + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough hourly candles' };
    }

    // Calculate indicators on hourly data
    const rsi = calculateRSI(hourlyCandles, this.rsiPeriod);
    const ema = calculateEMA(hourlyCandles, this.emaPeriod);
    const bb = calculateBollingerBands(hourlyCandles, this.bbPeriod, this.bbStdDev);
    const volumeRatio = getVolumeRatio(hourlyCandles, 10);

    const idx = hourlyCandles.length - 1;
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentEMA = ema[idx];
    const currentBBLower = bb.lower[idx];
    const currentHourCandle = hourlyCandles[idx];

    // Validate
    if (currentRSI === 0 || currentEMA === 0 || currentBBLower === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Hourly indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS (based on HOURLY data)
    // ═══════════════════════════════════════════════════════════

    // 1. Hourly RSI oversold
    const isOversold = currentRSI <= this.rsiOversold && currentRSI >= this.rsiMinimum;

    // 2. Hourly RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 3. Price near hourly BB lower
    const nearBBLower = currentPrice <= currentBBLower * 1.02;

    // 4. Not in crash
    const notCrashing = distanceFromEMA > -5;

    // 5. Current hour candle is bullish
    const isBullish = currentHourCandle.close > currentHourCandle.open;

    // ENTRY
    const hasEntrySignal = isOversold && rsiTurningUp && nearBBLower && notCrashing && isBullish;

    if (hasEntrySignal) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `H_MR BUY: H_RSI ${currentRSI.toFixed(1)} uptick | H_BB low [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD
    let reason = 'Waiting (hourly TF)';
    if (!isOversold) reason = `H_RSI ${currentRSI.toFixed(1)} > ${this.rsiOversold}`;
    else if (!rsiTurningUp) reason = 'H_RSI falling';
    else if (!nearBBLower) reason = 'Above H_BB lower';
    else if (!notCrashing) reason = `Far below EMA (${distanceFromEMA.toFixed(1)}%)`;
    else if (!isBullish) reason = 'Bearish hour candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
