import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateADX, getVolumeRatio, isBullishCandle } from '../utils/indicators';

/**
 * Pullback/Hybrid Strategy - HIGH WIN RATE MODE (70%+ TARGET)
 *
 * Best for: PULLBACKS IN UPTRENDS
 * Win Rate Target: 70%+
 * Risk Level: Medium
 *
 * OPTIMIZED PARAMETERS:
 * - Uptrend confirmed (EMA21 > EMA50, price near EMA21)
 * - RSI pullback (20-50) - wider range for more opportunities
 * - Price near EMA21 support (±6% range)
 * - Bullish reversal candle (confirmation)
 * - Volume > 0.7x average (relaxed)
 * - 2.0% stop loss (reasonable)
 * - 5.5% take profit (R:R = 1:2.75)
 *
 * Strategy Rules:
 * - Trade pullbacks when EMA21 > EMA50 (simple uptrend)
 * - Entry: RSI reset + pullback to EMA21 + bullish candle
 * - Exit: +5.5% TP or -2.0% SL or trailing (3% trigger, 1.2% trail)
 */
export class SashaHybridOptimizedStrategy extends BaseStrategy {
  // OPTIMIZED PARAMETERS
  private readonly rsiPeriod: number = 14;
  private readonly ema9Period: number = 9;   // Fast EMA (optional)
  private readonly ema21Period: number = 21; // Key pullback level
  private readonly ema50Period: number = 50; // Trend filter
  private readonly adxPeriod: number = 14;

  // RELAXED THRESHOLDS FOR MORE TRADES
  private readonly rsiLowerBound: number = 20; // Oversold but not extreme
  private readonly rsiUpperBound: number = 50; // Extended pullback zone (relaxed from 45)
  private readonly pullbackMaxPercent: number = 6.0; // Max distance from EMA21 (relaxed from 4.0)
  private readonly volumeMultiplier: number = 0.7; // 0.7x average volume (relaxed from 0.8)

  // IMPROVED RISK MANAGEMENT
  private readonly stopLossPercent: number = 2.0; // Reasonable stop (was 1.5%)
  private readonly takeProfitPercent: number = 5.5; // Better R:R (was 4.5%, now 1:2.75)
  private readonly trailingStopTrigger: number = 3.0; // Trail at 3% profit
  private readonly trailingStopAmount: number = 1.2; // Trail back 1.2%

  // CRASH AVOIDANCE (RELAXED)
  private readonly maxDistanceBelowEMA50: number = 10; // Avoid if > 10% below EMA50 (relaxed from 8%)

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
    // SIMPLIFIED ENTRY CONDITIONS (4 CORE FILTERS)
    // ═══════════════════════════════════════════════════════════

    // 1. UPTREND: Simple check - EMA21 > EMA50 (uptrend structure)
    const isUptrend = currentEMA21 > currentEMA50;

    // 2. RSI: Pullback zone (20-50) - wider range for more opportunities
    const isInPullbackZone = currentRSI >= this.rsiLowerBound && currentRSI <= this.rsiUpperBound;

    // 3. PULLBACK TO SUPPORT: Price near EMA21 (±6% range)
    const absDistanceFromEMA21 = Math.abs(distanceFromEMA21);
    const isNearEMA21 = absDistanceFromEMA21 <= this.pullbackMaxPercent;

    // 4. BULLISH REVERSAL: Current candle is bullish (entry confirmation)
    const isBullish = isBullishCandle(currentCandle);

    // 5. VOLUME: Above 0.7x average (basic confirmation)
    const hasVolumeConfirmation = volumeRatio >= this.volumeMultiplier;

    // BONUS: Not in crash mode (price not too far below EMA50)
    const notCrashing = distanceFromEMA50 > -this.maxDistanceBelowEMA50;

    // ENTRY SIGNAL: All 5 core conditions + bonus
    const hasEntrySignal = isUptrend && isInPullbackZone && isNearEMA21 && isBullish && hasVolumeConfirmation && notCrashing;

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
        reason: `Hybrid BUY: RSI ${currentRSI.toFixed(1)} | EMA21 ${distanceFromEMA21.toFixed(2)}% | Bullish | Vol ${volumeRatio.toFixed(2)}x [1:2.75 R:R]`
      };
    }

    // HOLD: Build detailed reason for waiting
    let reason = 'Waiting for pullback setup';

    if (!isUptrend) {
      reason = `No uptrend (EMA21: ${currentEMA21.toFixed(0)} vs EMA50: ${currentEMA50.toFixed(0)}). Need EMA21 > EMA50.`;
    } else if (!isInPullbackZone) {
      if (currentRSI < this.rsiLowerBound) {
        reason = `RSI too low (${currentRSI.toFixed(1)} < ${this.rsiLowerBound}). Wait for bounce.`;
      } else {
        reason = `RSI not pulled back (${currentRSI.toFixed(1)}, need ${this.rsiLowerBound}-${this.rsiUpperBound})`;
      }
    } else if (!isNearEMA21) {
      reason = `Price not near EMA21 (${distanceFromEMA21.toFixed(2)}%, need within ±${this.pullbackMaxPercent}%)`;
    } else if (!isBullish) {
      reason = `Waiting for bullish candle confirmation`;
    } else if (!hasVolumeConfirmation) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need >= ${this.volumeMultiplier}x)`;
    } else if (!notCrashing) {
      reason = `Crash avoidance (${distanceFromEMA50.toFixed(2)}% below EMA50, max ${-this.maxDistanceBelowEMA50}%)`;
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
