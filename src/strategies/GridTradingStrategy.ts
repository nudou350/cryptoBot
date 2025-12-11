import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA, calculateEMA, calculateRSI, calculateADX, calculateBollingerWidth, getVolumeRatio } from '../utils/indicators';

/**
 * Grid Trading Strategy - BALANCED MODE (65-70% WIN RATE TARGET)
 *
 * Best for: RANGING MARKETS (ADX < 28, BB Width < 5%)
 * Win Rate Target: 65-70%
 * Risk Level: Low
 *
 * BALANCED PARAMETERS:
 * - ADX < 28 (ranging market)
 * - RSI between 20-45 (oversold zone)
 * - Dip 1.0-5% below SMA20 (wider grid)
 * - BB Width < 5% (normal range acceptable)
 * - Volume > 0.8x average
 * - 1.5% stop loss (tight)
 * - 2.5% take profit (R:R = 1:1.67)
 *
 * Strategy Rules:
 * - ONLY trade when ADX < 28 AND BB Width < 5%
 * - Entry: RSI 20-45 AND 1.0-5% below SMA20 AND Volume confirm
 * - Exit: +2.5% TP or -1.5% SL or trailing (1.8% trigger)
 */
export class GridTradingStrategy extends BaseStrategy {
  // CONSERVATIVE PARAMETERS
  private readonly smaPeriod: number = 20;
  private readonly emaPeriod: number = 50;
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;
  private readonly bbPeriod: number = 20;

  // BALANCED THRESHOLDS
  private readonly adxRangingThreshold: number = 28; // Ranging market filter
  private readonly bbWidthMaxThreshold: number = 5; // Normal range acceptable
  private readonly rsiLowerBound: number = 20; // Oversold zone
  private readonly rsiUpperBound: number = 45; // Still in oversold zone
  private readonly dipMinPercent: number = 1.0; // Minimum dip below SMA
  private readonly dipMaxPercent: number = 5.0; // Maximum dip below SMA
  private readonly volumeMultiplier: number = 0.8; // 0.8x average volume (less strict)

  // CONSERVATIVE RISK MANAGEMENT
  private readonly stopLossPercent: number = 1.5; // TIGHT (was 2.5%)
  private readonly takeProfitPercent: number = 2.5; // Lower target for grid (was 3.5%)
  private readonly trailingStopTrigger: number = 1.8; // Trail at 1.8% profit (was 2.5%)
  private readonly trailingStopAmount: number = 0.8; // Trail back 0.8%

  // CRASH AVOIDANCE
  private readonly maxDistanceBelowEMA: number = 8; // Avoid if > 8% below EMA50

  private inPosition: boolean = false;
  private entryPrice: number = 0;
  private highestProfit: number = 0;

  constructor() {
    super('GridTrading');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.smaPeriod, this.emaPeriod, this.rsiPeriod, this.adxPeriod, this.bbPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate all indicators
    const sma = calculateSMA(candles, this.smaPeriod);
    const ema = calculateEMA(candles, this.emaPeriod);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const bbWidth = calculateBollingerWidth(candles, this.bbPeriod, 2);
    const volumeRatio = getVolumeRatio(candles, 20);

    // Get latest values
    const currentSMA = sma[sma.length - 1];
    const currentEMA = ema[ema.length - 1];
    const currentRSI = rsi[rsi.length - 1];
    const currentADX = adx[adx.length - 1];
    const currentBBWidth = bbWidth[bbWidth.length - 1];

    // Validate indicators
    if (currentSMA === 0 || currentEMA === 0 || currentRSI === 0 || currentADX === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromSMA = ((currentPrice - currentSMA) / currentSMA) * 100;
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
          reason: `Grid TP: +${profitPercent.toFixed(2)}% (SMA: ${distanceFromSMA.toFixed(2)}%)`
        };
      }

      // EXIT #2: Trailing stop
      if (this.highestProfit >= this.trailingStopTrigger && profitPercent <= this.highestProfit - this.trailingStopAmount) {
        const peakProfit = this.highestProfit;
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Grid TRAIL: +${profitPercent.toFixed(2)}% (peak: +${peakProfit.toFixed(2)}%)`
        };
      }

      // EXIT #3: Stop loss
      if (profitPercent <= -this.stopLossPercent) {
        this.resetPosition();
        return {
          action: 'close',
          price: currentPrice,
          reason: `Grid SL: ${profitPercent.toFixed(2)}% (SMA: ${distanceFromSMA.toFixed(2)}%)`
        };
      }

      // HOLD position
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Grid: ${profitPercent.toFixed(2)}% (peak: +${this.highestProfit.toFixed(2)}%, SMA: ${distanceFromSMA.toFixed(2)}%, TP: +${this.takeProfitPercent}%)`
      };
    }

    // ═══════════════════════════════════════════════════════════
    // CONSERVATIVE ENTRY CONDITIONS (ALL MUST BE TRUE)
    // ═══════════════════════════════════════════════════════════

    // 1. MARKET REGIME: Must be STRICT RANGING (ADX < 22)
    const isStrictRanging = currentADX < this.adxRangingThreshold;

    // 2. VOLATILITY: BB Width < 3.5% (tight range)
    const isTightRange = currentBBWidth < this.bbWidthMaxThreshold;

    // 3. RSI: In oversold zone (22-40)
    const isInOversoldZone = currentRSI >= this.rsiLowerBound && currentRSI <= this.rsiUpperBound;

    // 4. GRID LEVEL: Price 1.5-4% below SMA20
    const isDipInGrid = distanceFromSMA <= -this.dipMinPercent && distanceFromSMA >= -this.dipMaxPercent;

    // 5. VOLUME: Above 1.0x average
    const hasVolumeConfirmation = volumeRatio >= this.volumeMultiplier;

    // 6. CRASH AVOIDANCE: Not too far below EMA50
    const notCrashing = distanceFromEMA > -this.maxDistanceBelowEMA;

    // ALL CONDITIONS MUST BE TRUE
    const hasEntrySignal = isStrictRanging && isTightRange && isInOversoldZone && isDipInGrid && hasVolumeConfirmation && notCrashing;

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
        reason: `Grid BUY: SMA ${distanceFromSMA.toFixed(2)}% | RSI ${currentRSI.toFixed(1)} | ADX ${currentADX.toFixed(1)} | BBW ${currentBBWidth.toFixed(2)}% [1:1.67 R:R]`
      };
    }

    // HOLD: Build detailed reason for waiting
    let reason = 'Waiting for grid level';

    if (!isStrictRanging) {
      reason = `Market not ranging (ADX: ${currentADX.toFixed(1)} > ${this.adxRangingThreshold}). Grid disabled.`;
    } else if (!isTightRange) {
      reason = `Range too wide (BB Width: ${currentBBWidth.toFixed(2)}% > ${this.bbWidthMaxThreshold}%)`;
    } else if (!isInOversoldZone) {
      if (currentRSI < this.rsiLowerBound) {
        reason = `RSI too low (${currentRSI.toFixed(1)} < ${this.rsiLowerBound}). Wait for bounce.`;
      } else {
        reason = `RSI not oversold (${currentRSI.toFixed(1)}, need ${this.rsiLowerBound}-${this.rsiUpperBound})`;
      }
    } else if (!isDipInGrid) {
      if (distanceFromSMA > -this.dipMinPercent) {
        reason = `Above grid zone (SMA: ${distanceFromSMA.toFixed(2)}%, need ${-this.dipMinPercent}% to ${-this.dipMaxPercent}%)`;
      } else {
        reason = `Below grid zone (SMA: ${distanceFromSMA.toFixed(2)}%, max ${-this.dipMaxPercent}%)`;
      }
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
