import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateADX, getVolumeRatio } from '../utils/indicators';

/**
 * BALANCED Trend Following Strategy
 *
 * GOAL: Trade pullbacks in uptrends with moderate filters
 *
 * KEY PRINCIPLES:
 * 1. Clear but achievable trend conditions
 * 2. Pullback entries when trend is strong
 * 3. Moderate R:R ratio (1:2) for reasonable win rate
 *
 * TARGET: 50%+ win rate with 1:2 R:R = profitable
 * Math: 0.50 * 2.0% - 0.50 * 1.0% - 0.35% = 1.0% - 0.5% - 0.35% = +0.15%
 */
export class BalancedTrendStrategy extends BaseStrategy {
  // EMAs
  private readonly emaFast: number = 20;
  private readonly emaMedium: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;

  // Entry thresholds
  private readonly adxMinimum: number = 20; // Modest trend
  private readonly rsiPullbackMin: number = 35;
  private readonly rsiPullbackMax: number = 55;

  // Risk Management
  private readonly stopLossPercent: number = 1.0;
  private readonly takeProfitPercent: number = 2.0; // 1:2 R:R

  constructor() {
    super('BalancedTrend');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaMedium, this.adxPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const emaMediumArr = calculateEMA(candles, this.emaMedium);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const emaFast = emaFastArr[idx];
    const emaMedium = emaMediumArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentADX = adx[idx];
    const currentCandle = candles[idx];

    // Validate
    if (emaFast === 0 || emaMedium === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA20 = ((currentPrice - emaFast) / emaFast) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. Uptrend: EMA20 > EMA50
    const isUptrend = emaFast > emaMedium;

    // 2. Price above EMA50 (confirms uptrend)
    const aboveEMA50 = currentPrice > emaMedium;

    // 3. Has trend strength
    const hasTrend = currentADX >= this.adxMinimum;

    // 4. RSI in pullback zone
    const rsiPullback = currentRSI >= this.rsiPullbackMin && currentRSI <= this.rsiPullbackMax;

    // 5. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 6. Near EMA20 (the pullback level)
    const nearEMA20 = distanceFromEMA20 >= -2 && distanceFromEMA20 <= 2;

    // 7. Bullish candle
    const isBullish = currentCandle.close > currentCandle.open;

    // ENTRY
    const hasEntrySignal = isUptrend && aboveEMA50 && hasTrend &&
      rsiPullback && rsiTurningUp && nearEMA20 && isBullish;

    if (hasEntrySignal) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `BTrend BUY: ADX ${currentADX.toFixed(1)} | RSI ${currentRSI.toFixed(1)} [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD
    let reason = 'Waiting';
    if (!isUptrend) reason = 'No uptrend';
    else if (!aboveEMA50) reason = 'Below EMA50';
    else if (!hasTrend) reason = `Weak ADX (${currentADX.toFixed(1)})`;
    else if (!rsiPullback) reason = `RSI ${currentRSI.toFixed(1)} not in range`;
    else if (!rsiTurningUp) reason = 'RSI falling';
    else if (!nearEMA20) reason = `${distanceFromEMA20.toFixed(1)}% from EMA20`;
    else if (!isBullish) reason = 'Bearish candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
