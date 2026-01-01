import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateADX, calculateBollingerBands, calculateBollingerWidth, getVolumeRatio } from '../utils/indicators';

/**
 * Mean Reversion Strategy - HIGH WIN RATE MODE (70%+ TARGET)
 *
 * Best for: EXTREME OVERSOLD BOUNCES
 * Win Rate Target: 70%+
 * Risk Level: Medium
 *
 * OPTIMIZED PARAMETERS:
 * - Deep RSI oversold (15-35) - extreme but safe bounces
 * - Price below Bollinger Lower Band (strong oversold)
 * - Moderate ADX (< 35) - avoid strong downtrends
 * - Volume spike > 0.8x average (panic selling)
 * - 2.2% stop loss (reasonable protection)
 * - 5.0% take profit (R:R = 1:2.27)
 *
 * Strategy Rules:
 * - Trade extreme oversold conditions only
 * - Entry: Deep RSI + below BB + volume spike
 * - Exit: +5.0% TP or -2.2% SL or trailing (3% trigger, 1.2% trail)
 */
export class MeanReversionStrategy extends BaseStrategy {
  // OPTIMIZED PARAMETERS
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50; // For context only
  private readonly adxPeriod: number = 14;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // FOCUSED THRESHOLDS - EXTREME OVERSOLD ONLY
  private readonly rsiLowerBound: number = 25; // Deep oversold (extreme bounces)
  private readonly rsiUpperBound: number = 40; // Upper bound for oversold (relaxed from 38)
  private readonly adxMaxThreshold: number = 25; // Avoid strong downtrends (relaxed from 30)
  private readonly bbWidthMaxThreshold: number = 8; // Allow more volatility (relaxed from 6%)
  private readonly volumeMultiplier: number = 1.8; // 0.8x average volume (relaxed from 1.0)

  // IMPROVED RISK MANAGEMENT
  private readonly stopLossPercent: number = 3.0; // Reasonable stop (was 1.5%)
  private readonly takeProfitPercent: number = 5.0; // Better R:R (was 3.5%, now 1:2.27)
  private readonly trailingStopTrigger: number = 3.0; // Trail at 3% profit
  private readonly trailingStopAmount: number = 1.2; // Trail back 1.2%

  // CRASH AVOIDANCE (RELAXED)
  private readonly maxDistanceBelowEMA: number = 12; // Avoid if > 12% below EMA50 (relaxed from 8%)

  private entryPrice: number = 0;
  private inPosition: boolean = false;
  private highestProfit: number = 0;

  constructor() {
    super('MeanReversion');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.emaPeriod, this.adxPeriod, this.bbPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate all indicators
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const ema = calculateEMA(candles, this.emaPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const bb = calculateBollingerBands(candles, this.bbPeriod, this.bbStdDev);
    const bbWidth = calculateBollingerWidth(candles, this.bbPeriod, this.bbStdDev);
    const volumeRatio = getVolumeRatio(candles, 20);

    // Get latest values
    const currentRSI = rsi[rsi.length - 1];
    const currentEMA = ema[ema.length - 1];
    const currentADX = adx[adx.length - 1];
    const currentBBLower = bb.lower[bb.lower.length - 1];
    const currentBBWidth = bbWidth[bbWidth.length - 1];

    // Validate indicators
    if (currentRSI === 0 || currentEMA === 0 || currentADX === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

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
          reason: `MeanRev TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, ADX: ${currentADX.toFixed(1)})`
        };
      }

      // EXIT #2: Trailing stop
      if (this.highestProfit >= this.trailingStopTrigger && profitPercent <= this.highestProfit - this.trailingStopAmount) {
        const peakProfit = this.highestProfit;
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev TRAIL: +${profitPercent.toFixed(2)}% (peak: +${peakProfit.toFixed(2)}%)`
        };
      }

      // EXIT #3: Stop loss
      if (profitPercent <= -this.stopLossPercent) {
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev SL: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // HOLD position
      return {
        action: 'hold',
        price: currentPrice,
        reason: `MeanRev: ${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, RSI: ${currentRSI.toFixed(1)}, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ═══════════════════════════════════════════════════════════
    // SIMPLIFIED ENTRY CONDITIONS (4 CORE FILTERS)
    // ═══════════════════════════════════════════════════════════

    // 1. DEEP RSI OVERSOLD: 15-35 (extreme but safe for bounces)
    const isDeepOversold = currentRSI >= this.rsiLowerBound && currentRSI <= this.rsiUpperBound;

    // 2. BOLLINGER BAND: Price at or below lower band (strong oversold signal)
    const isBelowBB = currentPrice <= currentBBLower;

    // 3. VOLUME SPIKE: Above 0.8x average (panic selling creates opportunity)
    const hasVolumeConfirmation = volumeRatio >= this.volumeMultiplier;

    // 4. NOT STRONG DOWNTREND: ADX < 35 (avoid strong bearish trends)
    const notStrongDowntrend = currentADX < this.adxMaxThreshold;

    // BONUS: Not in crash mode
    const notCrashing = distanceFromEMA > -this.maxDistanceBelowEMA;

    // ENTRY SIGNAL: All 4 core conditions + bonus
    const hasEntrySignal = isDeepOversold && isBelowBB && hasVolumeConfirmation && notStrongDowntrend && notCrashing;

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
        reason: `MeanRev BUY: RSI ${currentRSI.toFixed(1)} | BB Lower | ADX ${currentADX.toFixed(1)} | Vol ${volumeRatio.toFixed(2)}x [1:2.27 R:R]`
      };
    }

    // HOLD: Build detailed reason for waiting
    let reason = 'Waiting for extreme oversold';

    if (!isDeepOversold) {
      if (currentRSI < this.rsiLowerBound) {
        reason = `RSI too extreme (${currentRSI.toFixed(1)} < ${this.rsiLowerBound}). Wait for stabilization.`;
      } else {
        reason = `Not oversold enough (RSI: ${currentRSI.toFixed(1)}, need ${this.rsiLowerBound}-${this.rsiUpperBound})`;
      }
    } else if (!isBelowBB) {
      reason = `Above BB lower band. Wait for price at/below $${currentBBLower.toFixed(2)}`;
    } else if (!hasVolumeConfirmation) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need >= ${this.volumeMultiplier}x)`;
    } else if (!notStrongDowntrend) {
      reason = `Strong downtrend (ADX: ${currentADX.toFixed(1)} > ${this.adxMaxThreshold}). Avoid catching falling knife.`;
    } else if (!notCrashing) {
      reason = `Crash avoidance (${distanceFromEMA.toFixed(2)}% below EMA50, max ${-this.maxDistanceBelowEMA}%)`;
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
