import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateADX, getVolumeRatio, isBullishCandle } from '../utils/indicators';

/**
 * Pullback/Hybrid Strategy - BALANCED MODE (60-65% WIN RATE TARGET)
 *
 * Best for: TRENDING MARKETS (ADX > 22)
 * Win Rate Target: 60-65%
 * Risk Level: Medium
 *
 * BALANCED PARAMETERS:
 * - ADX > 22 (trending market - OPPOSITE of MeanReversion)
 * - EMA alignment: EMA9 > EMA21 > EMA50 (bullish stack)
 * - RSI < 45 AND RSI > 25 (pullback but not crash)
 * - Price within 0.5-4% of EMA21 (wider pullback zone)
 * - Current candle is bullish (entry confirmation)
 * - Volume > 0.8x average
 * - 1.5% stop loss (tight)
 * - 4.5% take profit (R:R = 1:3)
 *
 * Strategy Rules:
 * - ONLY trade when ADX > 22 AND EMA stack aligned
 * - Entry: Pullback to EMA21 + RSI < 45 + Bullish candle
 * - Exit: +4.5% TP or -1.5% SL or trailing (2.5% trigger, 1% trail)
 */
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  // CONSERVATIVE PARAMETERS
  private readonly rsiPeriod: number = 14;
  private readonly ema9Period: number = 9;   // Fast EMA for stack
  private readonly ema21Period: number = 21; // Medium EMA (pullback level)
  private readonly ema50Period: number = 50; // Slow EMA for context
  private readonly adxPeriod: number = 14;

  // BALANCED THRESHOLDS
  private readonly adxTrendingThreshold: number = 22; // Must be TRENDING
  private readonly rsiOversoldThreshold: number = 45; // Pullback threshold
  private readonly rsiCrashThreshold: number = 25; // Too low = crash
  private readonly pullbackMinPercent: number = 0.5; // Min distance from EMA21
  private readonly pullbackMaxPercent: number = 4.0; // Max distance from EMA21
  private readonly volumeMultiplier: number = 0.8; // 0.8x average volume (less strict)

  // CONSERVATIVE RISK MANAGEMENT
  private readonly stopLossPercent: number = 1.5; // TIGHT (was 2.5%)
  private readonly takeProfitPercent: number = 4.5; // Higher for trends (R:R = 1:3)
  private readonly trailingStopTrigger: number = 2.5; // Trail at 2.5% profit
  private readonly trailingStopAmount: number = 1.0; // Trail back 1%

  // CRASH AVOIDANCE
  private readonly maxDistanceBelowEMA50: number = 8; // Avoid if > 8% below EMA50

  private inPosition: boolean = false;
  private entryPrice: number = 0;
  private highestProfit: number = 0;

  constructor() {
    super('Sasha-Hybrid-Optimized');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.ema9Period, this.ema21Period, this.ema50Period, this.adxPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate all indicators
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const ema9 = calculateEMA(candles, this.ema9Period);
    const ema21 = calculateEMA(candles, this.ema21Period);
    const ema50 = calculateEMA(candles, this.ema50Period);
    const adx = calculateADX(candles, this.adxPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    // Get latest values
    const currentRSI = rsi[rsi.length - 1];
    const currentEMA9 = ema9[ema9.length - 1];
    const currentEMA21 = ema21[ema21.length - 1];
    const currentEMA50 = ema50[ema50.length - 1];
    const currentADX = adx[adx.length - 1];
    const currentCandle = candles[candles.length - 1];

    // Validate indicators
    if (currentRSI === 0 || currentEMA9 === 0 || currentEMA21 === 0 || currentEMA50 === 0 || currentADX === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA21 = ((currentPrice - currentEMA21) / currentEMA21) * 100;
    const distanceFromEMA50 = ((currentPrice - currentEMA50) / currentEMA50) * 100;

    // POSITION MANAGEMENT
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Update highest profit for trailing stop
      if (profitPercent > this.highestProfit) {
        this.highestProfit = profitPercent;
      }

      // EXIT #1: Take profit
      if (profitPercent >= this.takeProfitPercent) {
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Hybrid TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, ADX: ${currentADX.toFixed(1)})`
        };
      }

      // EXIT #2: Trailing stop
      if (this.highestProfit >= this.trailingStopTrigger && profitPercent <= this.highestProfit - this.trailingStopAmount) {
        const peakProfit = this.highestProfit;
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Hybrid TRAIL: +${profitPercent.toFixed(2)}% (peak: +${peakProfit.toFixed(2)}%)`
        };
      }

      // EXIT #3: Stop loss
      if (profitPercent <= -this.stopLossPercent) {
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Hybrid SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Hybrid: ${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ═══════════════════════════════════════════════════════════
    // CONSERVATIVE ENTRY CONDITIONS (ALL MUST BE TRUE)
    // ═══════════════════════════════════════════════════════════

    // 1. MARKET REGIME: Must be TRENDING (ADX > 25)
    const isTrendingMarket = currentADX > this.adxTrendingThreshold;

    // 2. EMA ALIGNMENT: Bullish stack (EMA9 > EMA21 > EMA50)
    const isEmaAligned = currentEMA9 > currentEMA21 && currentEMA21 > currentEMA50;

    // 3. RSI: Pullback zone (20 < RSI < 32)
    const isInPullbackZone = currentRSI < this.rsiOversoldThreshold && currentRSI > this.rsiCrashThreshold;

    // 4. PULLBACK LEVEL: Price within 1.5-3% of EMA21
    // For pullbacks in uptrend, we look for price that has pulled back BELOW EMA21 or near it
    const absDistanceFromEMA21 = Math.abs(distanceFromEMA21);
    const isInPullbackRange = absDistanceFromEMA21 <= this.pullbackMaxPercent && absDistanceFromEMA21 >= this.pullbackMinPercent / 2;

    // 5. CANDLE CONFIRMATION: Current candle is bullish
    const isBullish = isBullishCandle(currentCandle);

    // 6. VOLUME: Above 1.0x average
    const hasVolumeConfirmation = volumeRatio >= this.volumeMultiplier;

    // 7. CRASH AVOIDANCE: Not too far below EMA50
    const notCrashing = distanceFromEMA50 > -this.maxDistanceBelowEMA50;

    // 8. PRICE ABOVE EMA50: Basic trend confirmation
    const priceAboveEMA50 = currentPrice > currentEMA50;

    // ALL CONDITIONS MUST BE TRUE
    const hasEntrySignal = isTrendingMarket && isEmaAligned && isInPullbackZone && isInPullbackRange && isBullish && hasVolumeConfirmation && notCrashing && priceAboveEMA50;

    if (hasEntrySignal && !this.inPosition) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      this.inPosition = true;
      this.entryPrice = currentPrice;
      this.highestProfit = 0;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Hybrid BUY: RSI ${currentRSI.toFixed(1)} | ADX ${currentADX.toFixed(1)} | EMA21 ${distanceFromEMA21.toFixed(2)}% | ${isBullish ? 'Bullish' : 'Bearish'} [1:3 R:R]`
      };
    }

    // HOLD: Build detailed reason for waiting
    let reason = 'Waiting for pullback';

    if (!isTrendingMarket) {
      reason = `Not trending (ADX: ${currentADX.toFixed(1)} < ${this.adxTrendingThreshold}). Hybrid disabled.`;
    } else if (!isEmaAligned) {
      reason = `EMA not aligned. Need EMA9 > EMA21 > EMA50. Current: ${currentEMA9.toFixed(0)} / ${currentEMA21.toFixed(0)} / ${currentEMA50.toFixed(0)}`;
    } else if (!priceAboveEMA50) {
      reason = `Price below EMA50 (${distanceFromEMA50.toFixed(2)}%). Wait for trend recovery.`;
    } else if (!isInPullbackZone) {
      if (currentRSI >= this.rsiOversoldThreshold) {
        reason = `RSI not pulled back (${currentRSI.toFixed(1)}, need < ${this.rsiOversoldThreshold})`;
      } else {
        reason = `RSI too low (${currentRSI.toFixed(1)} < ${this.rsiCrashThreshold}). Crash risk.`;
      }
    } else if (!isInPullbackRange) {
      reason = `Price not at EMA21 pullback zone (${distanceFromEMA21.toFixed(2)}%, need ${-this.pullbackMaxPercent}% to +${this.pullbackMaxPercent}%)`;
    } else if (!isBullish) {
      reason = `Waiting for bullish candle confirmation`;
    } else if (!hasVolumeConfirmation) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need >= ${this.volumeMultiplier}x)`;
    } else if (!notCrashing) {
      reason = `Crash avoidance active (${distanceFromEMA50.toFixed(2)}% below EMA50)`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }

  private resetPosition(): void {
    this.inPosition = false;
    this.entryPrice = 0;
    this.highestProfit = 0;
  }

  public reset(): void {
    this.resetPosition();
  }

  public restorePositionState(entryPrice: number, currentPrice: number): void {
    this.inPosition = true;
    this.entryPrice = entryPrice;
    const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    this.highestProfit = Math.max(0, profitPercent);
    console.log(`[${this.getName()}] State restored: Entry $${entryPrice.toFixed(2)}, Current $${currentPrice.toFixed(2)}, P&L ${profitPercent.toFixed(2)}%`);
  }
}
