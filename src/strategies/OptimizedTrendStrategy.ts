import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR, calculateADX, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMIZED Trend Following Strategy
 *
 * TARGET: PROFITABLE with 0.35% per-trade costs
 *
 * APPROACH: Trade pullbacks in uptrends with high R:R
 * - Clear trend identification (EMA alignment)
 * - Entry on pullbacks when RSI resets
 * - Higher R:R (1:4) to offset lower win rate typical of trend following
 *
 * Math for Profitability:
 * With 45% win rate and 1:4 R:R:
 * EV = (0.45 * 4%) - (0.55 * 1%) - 0.35% = 1.8% - 0.55% - 0.35% = +0.9% per trade
 */
export class OptimizedTrendStrategy extends BaseStrategy {
  // EMA periods
  private readonly emaFast: number = 21;
  private readonly emaMedium: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;
  private readonly adxPeriod: number = 14;

  // Entry thresholds
  private readonly adxMinThreshold: number = 20; // Modest trend strength
  private readonly rsiPullbackLow: number = 35; // RSI reset level
  private readonly rsiPullbackHigh: number = 55; // Upper bound

  // Risk Management - 1:4 R:R ratio
  private readonly atrStopLossMultiplier: number = 1.5; // 1.5 ATR stop
  private readonly atrTakeProfitMultiplier: number = 6.0; // 6 ATR take profit (1:4)

  constructor() {
    super('OptimizedTrend');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaMedium, this.adxPeriod, this.atrPeriod) + 20;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const emaMediumArr = calculateEMA(candles, this.emaMedium);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const atr = calculateATR(candles, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const currentEMAFast = emaFastArr[idx];
    const currentEMAMedium = emaMediumArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentADX = adx[idx];
    const currentATR = atr[idx];
    const currentCandle = candles[idx];

    // Validate
    if (currentEMAFast === 0 || currentEMAMedium === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA21 = ((currentPrice - currentEMAFast) / currentEMAFast) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. Uptrend: EMA21 > EMA50
    const isUptrend = currentEMAFast > currentEMAMedium;

    // 2. Trend strength: ADX > 20
    const hasTrendStrength = currentADX >= this.adxMinThreshold;

    // 3. RSI pullback zone
    const rsiInPullbackZone = currentRSI >= this.rsiPullbackLow && currentRSI <= this.rsiPullbackHigh;

    // 4. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 5. Price near EMA21 (within -3% to +3%)
    const nearEMA21 = distanceFromEMA21 >= -3 && distanceFromEMA21 <= 3;

    // 6. Bullish candle
    const isBullish = currentCandle.close > currentCandle.open;

    // 7. Price above EMA50
    const aboveEMA50 = currentPrice > currentEMAMedium;

    // 8. Basic volume
    const hasVolume = volumeRatio >= 0.8;

    // ENTRY: All conditions
    const hasEntrySignal = isUptrend && hasTrendStrength && rsiInPullbackZone &&
      rsiTurningUp && nearEMA21 && isBullish && aboveEMA50 && hasVolume;

    if (hasEntrySignal) {
      const stopLoss = currentPrice - (currentATR * this.atrStopLossMultiplier);
      const takeProfit = currentPrice + (currentATR * this.atrTakeProfitMultiplier);

      const risk = currentPrice - stopLoss;
      const reward = takeProfit - currentPrice;
      const rrRatio = reward / risk;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `OTrend BUY: EMA stack | ADX ${currentADX.toFixed(1)} | RSI ${currentRSI.toFixed(1)} pullback [R:R 1:${rrRatio.toFixed(1)}]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for trend pullback';
    if (!isUptrend) {
      reason = `No uptrend (EMA21 < EMA50)`;
    } else if (!hasTrendStrength) {
      reason = `Weak trend (ADX ${currentADX.toFixed(1)} < ${this.adxMinThreshold})`;
    } else if (!rsiInPullbackZone) {
      reason = `RSI ${currentRSI.toFixed(1)} not in pullback zone (${this.rsiPullbackLow}-${this.rsiPullbackHigh})`;
    } else if (!rsiTurningUp) {
      reason = `RSI still falling. Wait for bounce.`;
    } else if (!nearEMA21) {
      reason = `Price ${distanceFromEMA21.toFixed(1)}% from EMA21. Wait for pullback.`;
    } else if (!isBullish) {
      reason = `Waiting for bullish candle`;
    } else if (!aboveEMA50) {
      reason = `Price below EMA50`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
