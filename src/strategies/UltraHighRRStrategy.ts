import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR, getVolumeRatio, calculateADX, calculateDI } from '../utils/indicators';

/**
 * ULTRA HIGH R:R STRATEGY
 *
 * Uses 1:8 risk:reward ratio.
 * Accepts very low win rate (25%) because wins are so large.
 *
 * Math:
 * - 25% win rate with 1:8 R:R:
 *   0.25 * 16% - 0.75 * 2% - 0.35% = 4% - 1.5% - 0.35% = 2.15% per trade
 * - Need about 17 profitable trades over 2 years
 *
 * Entry: Strong trend confirmation on hourly
 * Exit: 2% stop, 16% target
 */
export class UltraHighRRStrategy extends BaseStrategy {
  // EMAs (on hourly)
  private readonly emaFast: number = 8;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 55;

  // ADX for trend strength
  private readonly adxPeriod: number = 14;
  private readonly minADX: number = 30; // Strong trend only

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds
  private readonly rsiMin: number = 50;
  private readonly rsiMax: number = 65;
  private readonly minVolumeRatio: number = 1.2;

  // Risk Management - ULTRA HIGH R:R
  private readonly stopLossATRMultiplier: number = 1.5;
  private readonly takeProfitATRMultiplier: number = 12.0; // 1:8 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('UltraHighRR');
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
    const adx = calculateADX(hourly, this.adxPeriod);
    const di = calculateDI(hourly, this.adxPeriod);
    const volumeRatio = getVolumeRatio(hourly, 10);

    const idx = hourly.length - 1;
    const emaFast = emaFastArr[idx];
    const emaMedium = emaMediumArr[idx];
    const emaSlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const currentADX = adx[idx];
    const plusDI = di.plusDI[idx];
    const minusDI = di.minusDI[idx];
    const hourCandle = hourly[idx];

    if (emaFast === 0 || emaSlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS (STRONG TREND ONLY)
    // ═══════════════════════════════════════════════════════════

    // 1. Strong ADX (strong trend)
    const strongTrend = currentADX >= this.minADX;

    // 2. Bullish DI
    const bullishDI = plusDI > minusDI;

    // 3. Bullish EMA stack
    const bullishStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 4. Price above EMA fast
    const priceAboveEMA = currentPrice > emaFast;

    // 5. RSI in healthy range
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 6. RSI momentum up
    const rsiUp = currentRSI > prevRSI;

    // 7. Volume confirmation
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 8. Bullish candle
    const bullishCandle = hourCandle.close > hourCandle.open;

    // ENTRY - requires ALL conditions (high quality only)
    const hasEntry = strongTrend && bullishDI && bullishStack && priceAboveEMA &&
                     rsiHealthy && rsiUp && hasVolume && bullishCandle;

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
        reason: `ULTRA_RR: ADX ${currentADX.toFixed(0)} | EMA stack | RSI ${currentRSI.toFixed(0)} | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!strongTrend) reason = `ADX ${currentADX.toFixed(0)} weak (need ${this.minADX})`;
    else if (!bullishDI) reason = 'Bearish DI';
    else if (!bullishStack) reason = 'No EMA stack';
    else if (!priceAboveEMA) reason = 'Below EMA';
    else if (!rsiHealthy) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!rsiUp) reason = 'RSI falling';
    else if (!hasVolume) reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    else if (!bullishCandle) reason = 'Bearish candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
