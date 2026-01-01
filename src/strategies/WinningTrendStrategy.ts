import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateADX, calculateMACD, getVolumeRatio } from '../utils/indicators';

/**
 * WINNING TREND STRATEGY - Trend Following for Profit
 *
 * APPROACH:
 * 1. Only trade in STRONG established uptrends (ADX > 25, EMA stack)
 * 2. Enter on pullbacks when RSI resets
 * 3. Use wider stops (2%) for trend trades
 * 4. Target 6% profit (1:3 R:R)
 *
 * Math: With 40% win rate and 1:3 R:R:
 * 0.40 * 6% - 0.60 * 2% - 0.35% = 2.4% - 1.2% - 0.35% = +0.85%
 *
 * STRICT ENTRY for high quality trades only
 */
export class WinningTrendStrategy extends BaseStrategy {
  // EMAs
  private readonly emaFast: number = 21;
  private readonly emaMedium: number = 50;
  private readonly emaSlow: number = 100;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;

  // Entry thresholds
  private readonly adxMinimum: number = 25; // Strong trend required
  private readonly rsiPullbackMin: number = 35;
  private readonly rsiPullbackMax: number = 50;

  // Risk Management - PERCENTAGE BASED
  private readonly stopLossPercent: number = 2.0; // 2% stop
  private readonly takeProfitPercent: number = 6.0; // 6% target (1:3)

  // Trade cooldown
  private lastEntryCandle: number = 0;
  private readonly minCandlesBetweenTrades: number = 120; // 2 hours

  constructor() {
    super('WinningTrend');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaSlow, this.adxPeriod) + 30;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const currentCandleIndex = candles.length - 1;

    // Cooldown check
    if (currentCandleIndex - this.lastEntryCandle < this.minCandlesBetweenTrades) {
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Cooldown: ${this.minCandlesBetweenTrades - (currentCandleIndex - this.lastEntryCandle)} candles`
      };
    }

    // Calculate indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const emaMediumArr = calculateEMA(candles, this.emaMedium);
    const emaSlowArr = calculateEMA(candles, this.emaSlow);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const macd = calculateMACD(candles);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const emaFast = emaFastArr[idx];
    const emaMedium = emaMediumArr[idx];
    const emaSlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentADX = adx[idx];
    const macdLine = macd.macd[idx];
    const signalLine = macd.signal[idx];
    const currentCandle = candles[idx];
    const prevCandle = candles[idx - 1];

    // Validate
    if (emaFast === 0 || emaMedium === 0 || emaSlow === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // TREND ANALYSIS
    // ═══════════════════════════════════════════════════════════

    // 1. Strong bullish EMA stack
    const emaStack = emaFast > emaMedium && emaMedium > emaSlow;

    // 2. Strong trend (ADX > 25)
    const strongTrend = currentADX >= this.adxMinimum;

    // 3. Price above all EMAs
    const priceAboveEMAs = currentPrice > emaFast && currentPrice > emaMedium && currentPrice > emaSlow;

    // 4. MACD bullish
    const macdBullish = macdLine > signalLine && macdLine > 0;

    // ═══════════════════════════════════════════════════════════
    // PULLBACK DETECTION
    // ═══════════════════════════════════════════════════════════

    // 5. RSI in pullback zone
    const rsiPullback = currentRSI >= this.rsiPullbackMin && currentRSI <= this.rsiPullbackMax;

    // 6. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 7. Price near EMA21 (within 2%)
    const distanceFromEMA21 = ((currentPrice - emaFast) / emaFast) * 100;
    const nearEMA21 = distanceFromEMA21 >= -2 && distanceFromEMA21 <= 2;

    // 8. Bullish candle with previous bearish (reversal pattern)
    const isBullish = currentCandle.close > currentCandle.open;
    const prevBearish = prevCandle.close < prevCandle.open;
    const hasReversal = isBullish && prevBearish;

    // 9. Volume
    const hasVolume = volumeRatio >= 0.9;

    // ENTRY SIGNAL
    const hasTrend = emaStack && strongTrend && priceAboveEMAs && macdBullish;
    const hasPullback = rsiPullback && rsiTurningUp && nearEMA21 && hasReversal;
    const hasEntrySignal = hasTrend && hasPullback && hasVolume;

    if (hasEntrySignal) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      this.lastEntryCandle = currentCandleIndex;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `TREND BUY: EMA stack | ADX ${currentADX.toFixed(1)} | RSI ${currentRSI.toFixed(1)} pullback [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for trend pullback';
    if (!emaStack) {
      reason = `No EMA stack (need EMA21 > EMA50 > EMA100)`;
    } else if (!strongTrend) {
      reason = `Weak trend (ADX ${currentADX.toFixed(1)} < ${this.adxMinimum})`;
    } else if (!priceAboveEMAs) {
      reason = `Price below EMAs`;
    } else if (!macdBullish) {
      reason = `MACD not bullish`;
    } else if (!rsiPullback) {
      reason = `RSI ${currentRSI.toFixed(1)} not in pullback zone (${this.rsiPullbackMin}-${this.rsiPullbackMax})`;
    } else if (!rsiTurningUp) {
      reason = `RSI still falling`;
    } else if (!nearEMA21) {
      reason = `Price ${distanceFromEMA21.toFixed(1)}% from EMA21 (need +-2%)`;
    } else if (!hasReversal) {
      reason = `No bullish reversal candle`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {
    this.lastEntryCandle = 0;
  }
}
