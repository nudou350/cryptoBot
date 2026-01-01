import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, calculateDI, getVolumeRatio } from '../utils/indicators';

/**
 * MULTI-TIMEFRAME TREND STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Use DAILY timeframe to determine the major trend direction
 * - Use 4H timeframe for trend confirmation
 * - Use 1H timeframe for precise entry timing
 * - Only trade in direction of ALL timeframes (alignment)
 * - Higher probability but fewer trades
 *
 * MATH:
 * - If win rate 45% with 1:3.5 R:R:
 *   - Win: 0.45 * 7% = 3.15%
 *   - Loss: 0.55 * 2% = 1.1%
 *   - Costs: 0.35%
 *   - Net per trade: 3.15% - 1.1% - 0.35% = 1.7%
 * - Need ~21 trades over 730 days = 1 trade every 35 days
 *
 * Timeframes: Daily trend -> 4H confirmation -> 1H entry
 */
export class MultiTimeframeTrendStrategy extends BaseStrategy {
  // Timeframe multipliers (1-min candles)
  private readonly candlesPer1H: number = 60;
  private readonly candlesPer4H: number = 240;
  private readonly candlesPerDay: number = 1440;

  // EMA periods for each timeframe
  private readonly emaFastDaily: number = 8;
  private readonly emaSlowDaily: number = 21;
  private readonly emaFast4H: number = 10;
  private readonly emaSlow4H: number = 21;
  private readonly emaFast1H: number = 9;
  private readonly emaMedium1H: number = 21;
  private readonly emaSlow1H: number = 50;

  // Other indicators
  private readonly adxPeriod: number = 14;
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Thresholds
  private readonly adxTrendThreshold: number = 25; // Strong trend
  private readonly rsiMin: number = 40;
  private readonly rsiMax: number = 65;
  private readonly minVolumeRatio: number = 1.2;

  // Risk Management
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 7.0; // 1:3.5 R:R

  constructor() {
    super('MultiTimeframeTrend');
  }

  private resampleToTimeframe(candles: Candle[], candlesPerPeriod: number): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + candlesPerPeriod <= candles.length; i += candlesPerPeriod) {
      const slice = candles.slice(i, i + candlesPerPeriod);
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
    // Need enough data for daily analysis (at least 30 days)
    const minCandles = 30 * this.candlesPerDay;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Resample to different timeframes
    const dailyCandles = this.resampleToTimeframe(candles, this.candlesPerDay);
    const candles4H = this.resampleToTimeframe(candles, this.candlesPer4H);
    const candles1H = this.resampleToTimeframe(candles, this.candlesPer1H);

    if (dailyCandles.length < 25 || candles4H.length < 25 || candles1H.length < 55) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough resampled data' };
    }

    // ═══════════════════════════════════════════════════════════
    // DAILY TIMEFRAME - Major Trend
    // ═══════════════════════════════════════════════════════════

    const emaFastDaily = calculateEMA(dailyCandles, this.emaFastDaily);
    const emaSlowDaily = calculateEMA(dailyCandles, this.emaSlowDaily);
    const adxDaily = calculateADX(dailyCandles, this.adxPeriod);
    const diDaily = calculateDI(dailyCandles, this.adxPeriod);

    const idxDaily = dailyCandles.length - 1;
    const dailyEMAFast = emaFastDaily[idxDaily];
    const dailyEMASlow = emaSlowDaily[idxDaily];
    const dailyADX = adxDaily[idxDaily];
    const dailyPlusDI = diDaily.plusDI[idxDaily];
    const dailyMinusDI = diDaily.minusDI[idxDaily];

    // Daily trend conditions
    const dailyUptrend = dailyEMAFast > dailyEMASlow;
    const dailyStrongTrend = dailyADX >= this.adxTrendThreshold;
    const dailyBullishDI = dailyPlusDI > dailyMinusDI;

    // ═══════════════════════════════════════════════════════════
    // 4H TIMEFRAME - Trend Confirmation
    // ═══════════════════════════════════════════════════════════

    const emaFast4H = calculateEMA(candles4H, this.emaFast4H);
    const emaSlow4H = calculateEMA(candles4H, this.emaSlow4H);
    const atr4H = calculateATR(candles4H, this.atrPeriod);

    const idx4H = candles4H.length - 1;
    const h4EMAFast = emaFast4H[idx4H];
    const h4EMASlow = emaSlow4H[idx4H];
    const h4ATR = atr4H[idx4H];

    // 4H trend conditions
    const h4Uptrend = h4EMAFast > h4EMASlow;
    const priceAbove4HEMA = currentPrice > h4EMAFast;

    // ═══════════════════════════════════════════════════════════
    // 1H TIMEFRAME - Entry Timing
    // ═══════════════════════════════════════════════════════════

    const emaFast1H = calculateEMA(candles1H, this.emaFast1H);
    const emaMedium1H = calculateEMA(candles1H, this.emaMedium1H);
    const emaSlow1H = calculateEMA(candles1H, this.emaSlow1H);
    const rsi1H = calculateRSI(candles1H, this.rsiPeriod);
    const atr1H = calculateATR(candles1H, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles1H, 10);

    const idx1H = candles1H.length - 1;
    const h1EMAFast = emaFast1H[idx1H];
    const h1EMAMedium = emaMedium1H[idx1H];
    const h1EMASlow = emaSlow1H[idx1H];
    const h1RSI = rsi1H[idx1H];
    const prevRSI = rsi1H[idx1H - 1];
    const h1ATR = atr1H[idx1H];
    const h1Candle = candles1H[idx1H];

    // 1H entry conditions
    const h1EMAStack = h1EMAFast > h1EMAMedium && h1EMAMedium > h1EMASlow;
    const priceAbove1HEMA = currentPrice > h1EMAFast;
    const rsiHealthy = h1RSI >= this.rsiMin && h1RSI <= this.rsiMax;
    const rsiRising = h1RSI > prevRSI;
    const bullishCandle = h1Candle.close > h1Candle.open;
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // ═══════════════════════════════════════════════════════════
    // ENTRY SIGNAL - All Timeframes Aligned
    // ═══════════════════════════════════════════════════════════

    const dailyAligned = dailyUptrend && dailyStrongTrend && dailyBullishDI;
    const h4Aligned = h4Uptrend && priceAbove4HEMA;
    const h1Entry = h1EMAStack && priceAbove1HEMA && rsiHealthy && rsiRising && bullishCandle && hasVolume;

    const hasEntry = dailyAligned && h4Aligned && h1Entry;

    if (hasEntry) {
      // Use 4H ATR for stops (more significant moves)
      const stopLoss = currentPrice - (h4ATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (h4ATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MTF ALIGNED: D:${dailyADX.toFixed(0)}ADX | 4H:trend | 1H:stack | RSI ${h1RSI.toFixed(0)} | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    // Build reason
    let reason = 'Waiting';
    if (!dailyUptrend) reason = 'Daily: No uptrend';
    else if (!dailyStrongTrend) reason = `Daily: ADX ${dailyADX.toFixed(0)} weak`;
    else if (!dailyBullishDI) reason = 'Daily: DI bearish';
    else if (!h4Uptrend) reason = '4H: No uptrend';
    else if (!priceAbove4HEMA) reason = '4H: Below EMA';
    else if (!h1EMAStack) reason = '1H: No EMA stack';
    else if (!priceAbove1HEMA) reason = '1H: Below fast EMA';
    else if (!rsiHealthy) reason = `1H: RSI ${h1RSI.toFixed(0)} out of range`;
    else if (!rsiRising) reason = '1H: RSI falling';
    else if (!bullishCandle) reason = '1H: Bearish candle';
    else if (!hasVolume) reason = `1H: Low vol ${volumeRatio.toFixed(1)}x`;

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
