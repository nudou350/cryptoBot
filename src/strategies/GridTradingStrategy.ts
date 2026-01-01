import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA, calculateEMA, calculateRSI, calculateADX, calculateBollingerWidth, getVolumeRatio } from '../utils/indicators';

/**
 * Grid Trading Strategy - HIGH WIN RATE MODE (70%+ TARGET)
 *
 * Best for: DIP BUYING IN UPTRENDS
 * Win Rate Target: 70%+
 * Risk Level: Low-Medium
 *
 * OPTIMIZED PARAMETERS:
 * - Uptrend confirmed (Price > EMA50 or recovering)
 * - RSI oversold (15-40) - buy the dip
 * - Price pullback 0.5-6% below SMA20 (flexible grid)
 * - Volume spike > 0.7x average (relaxed)
 * - 1.8% stop loss (reasonable)
 * - 4.0% take profit (R:R = 1:2.2)
 *
 * Strategy Rules:
 * - Trade dips in uptrends (not strict ranging)
 * - Entry: RSI oversold + dip below SMA + volume
 * - Exit: +4.0% TP or -1.8% SL or trailing (2.5% trigger)
 */
export class GridTradingStrategy extends BaseStrategy {
  // OPTIMIZED PARAMETERS
  private readonly smaPeriod: number = 20;
  private readonly emaPeriod: number = 50;
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;
  private readonly bbPeriod: number = 20;

  // RELAXED THRESHOLDS FOR MORE TRADES
  private readonly rsiLowerBound: number = 25; // Deep oversold (catch bounces)
  private readonly rsiUpperBound: number = 38; // Extended oversold zone
  private readonly dipMinPercent: number = 1.5; // Minimum dip below SMA (relaxed from 1.0)
  private readonly dipMaxPercent: number = 4.0; // Maximum dip below SMA (relaxed from 5.0)
  private readonly volumeMultiplier: number = 1.8; // 0.7x average volume (very relaxed)

  // IMPROVED RISK MANAGEMENT
  private readonly stopLossPercent: number = 3.0; // Reasonable stop (was 1.5%)
  private readonly takeProfitPercent: number = 5.0; // Better R:R (was 2.5%, now 1:2.2)
  private readonly trailingStopTrigger: number = 2.5; // Trail at 2.5% profit
  private readonly trailingStopAmount: number = 1.0; // Trail back 1%

  // CRASH AVOIDANCE (RELAXED)
  private readonly maxDistanceBelowEMA: number = 10; // Avoid if > 10% below EMA50 (relaxed from 8%)

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
    // SIMPLIFIED ENTRY CONDITIONS (4 CORE FILTERS)
    // ═══════════════════════════════════════════════════════════

    // 1. RSI: In oversold zone (15-40) - PRIMARY SIGNAL
    const isInOversoldZone = currentRSI >= this.rsiLowerBound && currentRSI <= this.rsiUpperBound;

    // 2. PRICE DIP: 0.5-6% below SMA20 (buy the dip)
    const isDipBelowSMA = distanceFromSMA <= -this.dipMinPercent && distanceFromSMA >= -this.dipMaxPercent;

    // 3. VOLUME: Above 0.7x average (basic confirmation)
    const hasVolumeConfirmation = volumeRatio >= this.volumeMultiplier;

    // 4. CRASH AVOIDANCE: Not more than 10% below EMA50
    const notCrashing = distanceFromEMA > -this.maxDistanceBelowEMA;

    // BONUS: Prefer uptrends but not required (price within 15% of EMA50)
    const nearUptrend = distanceFromEMA > -15;

    // ENTRY SIGNAL: All 4 core conditions + bonus
    const hasEntrySignal = isInOversoldZone && isDipBelowSMA && hasVolumeConfirmation && notCrashing && nearUptrend;

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
        reason: `Grid BUY: RSI ${currentRSI.toFixed(1)} | SMA ${distanceFromSMA.toFixed(2)}% | EMA ${distanceFromEMA.toFixed(2)}% | Vol ${volumeRatio.toFixed(2)}x [1:2.2 R:R]`
      };
    }

    // HOLD: Build detailed reason for waiting
    let reason = 'Waiting for dip setup';

    if (!isInOversoldZone) {
      if (currentRSI < this.rsiLowerBound) {
        reason = `RSI too low (${currentRSI.toFixed(1)} < ${this.rsiLowerBound}). Extreme oversold, wait for bounce.`;
      } else {
        reason = `RSI not oversold (${currentRSI.toFixed(1)}, need ${this.rsiLowerBound}-${this.rsiUpperBound})`;
      }
    } else if (!isDipBelowSMA) {
      if (distanceFromSMA > -this.dipMinPercent) {
        reason = `No dip yet (SMA: ${distanceFromSMA.toFixed(2)}%, need ${-this.dipMinPercent}% to ${-this.dipMaxPercent}%)`;
      } else {
        reason = `Dip too deep (SMA: ${distanceFromSMA.toFixed(2)}%, max ${-this.dipMaxPercent}%)`;
      }
    } else if (!hasVolumeConfirmation) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need >= ${this.volumeMultiplier}x)`;
    } else if (!notCrashing) {
      reason = `Crash avoidance (${distanceFromEMA.toFixed(2)}% below EMA50, max ${-this.maxDistanceBelowEMA}%)`;
    } else if (!nearUptrend) {
      reason = `Too far from trend (${distanceFromEMA.toFixed(2)}% below EMA50, max -15%)`;
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
