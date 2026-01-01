import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateADX, calculateMACD, getVolumeRatio } from '../utils/indicators';

/**
 * HOURLY Trend Following Strategy
 *
 * KEY INSIGHT: Use hourly resampled data for cleaner trend signals.
 *
 * APPROACH:
 * 1. Identify uptrend on hourly timeframe
 * 2. Enter on pullbacks
 * 3. Use wider stops for hourly-based signals
 *
 * TARGET: 50%+ win rate with 1:2.5 R:R
 * Math: 0.50 * 2.5% - 0.50 * 1% - 0.35% = 1.25% - 0.5% - 0.35% = +0.40% per trade
 */
export class HourlyTrendStrategy extends BaseStrategy {
  // Indicator periods (on hourly data)
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;

  // Entry thresholds
  private readonly adxMinimum: number = 20;
  private readonly rsiMin: number = 35;
  private readonly rsiMax: number = 55;

  // Risk Management
  private readonly stopLossPercent: number = 1.5;
  private readonly takeProfitPercent: number = 3.75; // 1:2.5 R:R

  // Resampling
  private readonly candlesPerHour: number = 60;

  constructor() {
    super('HourlyTrend');
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
    const minCandles = (this.emaSlow + 10) * this.candlesPerHour;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Resample to hourly
    const hourlyCandles = this.resampleToHourly(candles);

    if (hourlyCandles.length < this.emaSlow + 10) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough hourly candles' };
    }

    // Calculate indicators on hourly data
    const emaFastArr = calculateEMA(hourlyCandles, this.emaFast);
    const emaMediumArr = calculateEMA(hourlyCandles, this.emaMedium);
    const emaSlowArr = calculateEMA(hourlyCandles, this.emaSlow);
    const rsi = calculateRSI(hourlyCandles, this.rsiPeriod);
    const adx = calculateADX(hourlyCandles, this.adxPeriod);
    const macd = calculateMACD(hourlyCandles);
    const volumeRatio = getVolumeRatio(hourlyCandles, 10);

    const idx = hourlyCandles.length - 1;
    const emaFast = emaFastArr[idx];
    const emaMedium = emaMediumArr[idx];
    const emaSlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentADX = adx[idx];
    const macdLine = macd.macd[idx];
    const signalLine = macd.signal[idx];
    const currentHourCandle = hourlyCandles[idx];

    // Validate
    if (emaFast === 0 || emaMedium === 0 || emaSlow === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Hourly indicators not ready' };
    }

    const distanceFromEMAFast = ((currentPrice - emaFast) / emaFast) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS (based on HOURLY data)
    // ═══════════════════════════════════════════════════════════

    // 1. Bullish EMA stack
    const bullishStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 2. Price above all EMAs
    const priceAboveEMAs = currentPrice > emaFast;

    // 3. ADX shows trend
    const hasTrend = currentADX >= this.adxMinimum;

    // 4. MACD bullish
    const macdBullish = macdLine > signalLine && macdLine > 0;

    // 5. RSI in pullback zone
    const rsiPullback = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 6. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 7. Near EMA fast (pullback to support)
    const nearEMAFast = distanceFromEMAFast >= -2 && distanceFromEMAFast <= 3;

    // 8. Bullish hourly candle
    const isBullish = currentHourCandle.close > currentHourCandle.open;

    // ENTRY
    const hasEntrySignal = bullishStack && priceAboveEMAs && hasTrend && macdBullish &&
      rsiPullback && rsiTurningUp && nearEMAFast && isBullish;

    if (hasEntrySignal) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `H_Trend BUY: EMA stack | ADX ${currentADX.toFixed(1)} | RSI ${currentRSI.toFixed(1)} [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD
    let reason = 'Waiting (hourly TF)';
    if (!bullishStack) reason = 'No EMA stack';
    else if (!priceAboveEMAs) reason = 'Below EMA fast';
    else if (!hasTrend) reason = `Weak ADX (${currentADX.toFixed(1)})`;
    else if (!macdBullish) reason = 'MACD not bullish';
    else if (!rsiPullback) reason = `RSI ${currentRSI.toFixed(1)} not in range`;
    else if (!rsiTurningUp) reason = 'RSI falling';
    else if (!nearEMAFast) reason = `${distanceFromEMAFast.toFixed(1)}% from EMA`;
    else if (!isBullish) reason = 'Bearish hour candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
