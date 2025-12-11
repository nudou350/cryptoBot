import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateADX, calculateBollingerBands, calculateBollingerWidth, getVolumeRatio } from '../utils/indicators';

/**
 * Mean Reversion Strategy - BALANCED MODE (65%+ WIN RATE TARGET)
 *
 * Best for: RANGING MARKETS (ADX < 30)
 * Win Rate Target: 65-70%
 * Risk Level: Low-Medium
 *
 * BALANCED PARAMETERS:
 * - RSI < 38 (reasonable oversold level)
 * - ADX < 30 (ranging market filter)
 * - Price at or below Bollinger Lower Band
 * - Volume > 1.0x average (basic confirmation)
 * - BB Width < 6% (normal volatility acceptable)
 * - 1.5% stop loss (tight)
 * - 3.5% take profit (R:R = 1:2.3)
 *
 * Strategy Rules:
 * - ONLY trade when market is RANGING (ADX < 30)
 * - Entry: RSI < 38 + Below BB Lower + Volume confirm
 * - Exit: +3.5% TP or -1.5% SL or trailing (2% trigger, 1% trail)
 */
export class MeanReversionStrategy extends BaseStrategy {
  // CONSERVATIVE PARAMETERS
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50; // For context only
  private readonly adxPeriod: number = 14;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // BALANCED THRESHOLDS
  private readonly oversoldThreshold: number = 38; // Reasonable oversold level
  private readonly adxRangingThreshold: number = 30; // Market must be ranging
  private readonly bbWidthMaxThreshold: number = 6; // Normal volatility acceptable
  private readonly volumeMultiplier: number = 1.0; // 1.0x average volume

  // CONSERVATIVE RISK MANAGEMENT
  private readonly stopLossPercent: number = 1.5; // TIGHT (was 2.5%)
  private readonly takeProfitPercent: number = 3.5; // R:R = 1:2.3
  private readonly trailingStopTrigger: number = 2.0; // Trail at 2% profit
  private readonly trailingStopAmount: number = 1.0; // Trail back 1%

  // CRASH AVOIDANCE
  private readonly maxDistanceBelowEMA: number = 8; // Avoid if > 8% below EMA50

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
    // CONSERVATIVE ENTRY CONDITIONS (ALL MUST BE TRUE)
    // ═══════════════════════════════════════════════════════════

    // 1. MARKET REGIME: Must be RANGING (ADX < 25)
    const isRangingMarket = currentADX < this.adxRangingThreshold;

    // 2. RSI: Strict oversold (< 28)
    const isOversold = currentRSI < this.oversoldThreshold;

    // 3. BOLLINGER: Price at or below lower band
    const isBelowBB = currentPrice <= currentBBLower;

    // 4. VOLATILITY: BB Width < 4% (low volatility)
    const isLowVolatility = currentBBWidth < this.bbWidthMaxThreshold;

    // 5. VOLUME: Above 1.2x average
    const hasVolumeConfirmation = volumeRatio >= this.volumeMultiplier;

    // 6. CRASH AVOIDANCE: Not too far below EMA50
    const notCrashing = distanceFromEMA > -this.maxDistanceBelowEMA;

    // ALL CONDITIONS MUST BE TRUE
    const hasEntrySignal = isRangingMarket && isOversold && isBelowBB && isLowVolatility && hasVolumeConfirmation && notCrashing;

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
        reason: `MeanRev BUY: RSI ${currentRSI.toFixed(1)} | ADX ${currentADX.toFixed(1)} | BB ${isBelowBB ? 'Below' : 'Above'} | Vol ${volumeRatio.toFixed(2)}x [1:2.3 R:R]`
      };
    }

    // HOLD: Build detailed reason for waiting
    let reason = 'Waiting for setup';

    if (!isRangingMarket) {
      reason = `Trending market (ADX: ${currentADX.toFixed(1)} > ${this.adxRangingThreshold}). Mean reversion disabled.`;
    } else if (!isOversold) {
      reason = `Not oversold (RSI: ${currentRSI.toFixed(1)}, need < ${this.oversoldThreshold})`;
    } else if (!isBelowBB) {
      reason = `Above BB lower. Wait for price at/below $${currentBBLower.toFixed(2)}`;
    } else if (!isLowVolatility) {
      reason = `High volatility (BB Width: ${currentBBWidth.toFixed(2)}% > ${this.bbWidthMaxThreshold}%)`;
    } else if (!hasVolumeConfirmation) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need >= ${this.volumeMultiplier}x)`;
    } else if (!notCrashing) {
      reason = `Crash avoidance active (${distanceFromEMA.toFixed(2)}% below EMA50)`;
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
