import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateBollingerBands, calculateBollingerWidth, getVolumeRatio } from '../utils/indicators';

/**
 * PROFITABLE Breakout Strategy
 *
 * DESIGNED TO BE PROFITABLE with 0.35% per-trade costs
 *
 * Key Design Principles:
 * 1. High R:R Ratio (1:6) - Breakouts can run far
 * 2. Volatility Squeeze - Enter when BB contracts then expands
 * 3. Volume Explosion - Confirm breakout with volume
 * 4. Failed Breakout Filter - Wait for confirmation candle
 *
 * Target: 40%+ win rate with 1:6 R:R = PROFITABLE
 *
 * Math: (0.40 * 6%) - (0.60 * 1%) - 0.35% = 2.4% - 0.6% - 0.35% = +1.45% per trade
 */
export class ProfitableBreakoutStrategy extends BaseStrategy {
  // Indicator periods
  private readonly ema20: number = 20;
  private readonly ema50: number = 50;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;
  private readonly atrPeriod: number = 14;
  private readonly lookbackPeriod: number = 20; // For highs/lows

  // Entry thresholds
  private readonly bbWidthSqueeze: number = 3.5; // BB width must be < 3.5% (consolidation)
  private readonly volumeMultiplier: number = 2.0; // Need strong volume surge
  private readonly minBreakoutPercent: number = 0.3; // Min breakout above resistance

  // Risk Management - 1:6 R:R ratio
  private readonly atrStopLossMultiplier: number = 1.0; // 1 ATR stop (tight)
  private readonly atrTakeProfitMultiplier: number = 6.0; // 6 ATR take profit

  // Minimum volatility
  private readonly minATRPercent: number = 0.3;

  constructor() {
    super('ProfitableBreakout');
  }

  private getHighestHigh(candles: Candle[], period: number): number {
    const slice = candles.slice(-period - 1, -1); // Exclude current candle
    return Math.max(...slice.map(c => c.high));
  }

  private getLowestLow(candles: Candle[], period: number): number {
    const slice = candles.slice(-period - 1, -1); // Exclude current candle
    return Math.min(...slice.map(c => c.low));
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.ema50, this.bbPeriod, this.atrPeriod, this.lookbackPeriod) + 30;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate all indicators
    const ema20Arr = calculateEMA(candles, this.ema20);
    const ema50Arr = calculateEMA(candles, this.ema50);
    const bb = calculateBollingerBands(candles, this.bbPeriod, this.bbStdDev);
    const bbWidth = calculateBollingerWidth(candles, this.bbPeriod, this.bbStdDev);
    const atr = calculateATR(candles, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    // Get latest values
    const idx = candles.length - 1;
    const currentEMA20 = ema20Arr[idx];
    const currentEMA50 = ema50Arr[idx];
    const currentBBUpper = bb.upper[idx];
    const currentBBMiddle = bb.middle[idx];
    const currentBBWidth = bbWidth[idx];
    const currentATR = atr[idx];
    const currentCandle = candles[idx];

    // Previous values
    const prevBBWidth = bbWidth[idx - 1];
    const prevCandle = candles[idx - 1];

    // Price levels
    const highestHigh = this.getHighestHigh(candles, this.lookbackPeriod);
    const lowestLow = this.getLowestLow(candles, this.lookbackPeriod);

    // Validate indicators
    if (currentEMA20 === 0 || currentBBUpper === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Calculate ATR as percentage
    const atrPercent = (currentATR / currentPrice) * 100;

    // ═══════════════════════════════════════════════════════════
    // BREAKOUT CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. SQUEEZE: BB was contracted (consolidation phase)
    const wasInSqueeze = prevBBWidth <= this.bbWidthSqueeze;

    // 2. EXPANSION: BB is now expanding (breakout starting)
    const isExpanding = currentBBWidth > prevBBWidth;

    // 3. BREAKOUT: Price broke above resistance
    const brokeAboveResistance = currentPrice > highestHigh;
    const breakoutPercent = ((currentPrice - highestHigh) / highestHigh) * 100;
    const significantBreakout = breakoutPercent >= this.minBreakoutPercent;

    // 4. PRICE ABOVE BB UPPER: Momentum confirmation
    const aboveBBUpper = currentPrice > currentBBUpper;

    // 5. VOLUME SURGE: Confirm with big volume
    const hasVolumeSurge = volumeRatio >= this.volumeMultiplier;

    // 6. BULLISH CANDLE: Current candle is bullish
    const isBullishCandle = currentCandle.close > currentCandle.open;

    // 7. CLOSED ABOVE RESISTANCE: Not just a wick
    const closedAboveResistance = currentCandle.close > highestHigh;

    // 8. TREND CONTEXT: EMA20 > EMA50 (uptrend context)
    const uptrendContext = currentEMA20 > currentEMA50;

    // 9. PRICE ABOVE EMAs
    const priceAboveEMAs = currentPrice > currentEMA20;

    // 10. SUFFICIENT VOLATILITY
    const hasVolatility = atrPercent >= this.minATRPercent;

    // ═══════════════════════════════════════════════════════════
    // ENTRY SIGNAL
    // ═══════════════════════════════════════════════════════════

    const hasSqueezeBreakout = wasInSqueeze && isExpanding;
    const hasValidBreakout = brokeAboveResistance && significantBreakout && closedAboveResistance;
    const hasMomentum = aboveBBUpper && isBullishCandle;
    const hasConfirmation = hasVolumeSurge && hasVolatility;
    const hasTrendContext = uptrendContext && priceAboveEMAs;

    const hasEntrySignal = hasSqueezeBreakout && hasValidBreakout && hasMomentum && hasConfirmation && hasTrendContext;

    if (hasEntrySignal) {
      // ATR-based dynamic stops for 1:6 R:R
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
        reason: `PBreak BUY: Squeeze breakout +${breakoutPercent.toFixed(2)}% | BB expand | Vol ${volumeRatio.toFixed(1)}x | ATR ${atrPercent.toFixed(2)}% [R:R 1:${rrRatio.toFixed(1)}]`
      };
    }

    // ═══════════════════════════════════════════════════════════
    // HOLD: Detailed reason
    // ═══════════════════════════════════════════════════════════

    let reason = 'Waiting for volatility squeeze breakout';

    if (!wasInSqueeze) {
      reason = `No squeeze (BB width ${prevBBWidth.toFixed(2)}%, need < ${this.bbWidthSqueeze}%)`;
    } else if (!isExpanding) {
      reason = `BB contracting, not expanding. Wait for breakout.`;
    } else if (!brokeAboveResistance) {
      reason = `Price $${currentPrice.toFixed(2)} below resistance $${highestHigh.toFixed(2)}`;
    } else if (!significantBreakout) {
      reason = `Breakout too weak (+${breakoutPercent.toFixed(2)}%, need +${this.minBreakoutPercent}%)`;
    } else if (!closedAboveResistance) {
      reason = `Wick above resistance, but close below. Wait for confirmation.`;
    } else if (!aboveBBUpper) {
      reason = `Price below BB upper. Weak momentum.`;
    } else if (!isBullishCandle) {
      reason = `Bearish candle on breakout. Wait for bullish confirmation.`;
    } else if (!hasVolumeSurge) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need ${this.volumeMultiplier}x+). False breakout risk.`;
    } else if (!uptrendContext) {
      reason = `No uptrend context (EMA20 < EMA50). Risky breakout.`;
    } else if (!priceAboveEMAs) {
      reason = `Price below EMA20. Not bullish enough.`;
    } else if (!hasVolatility) {
      reason = `Low ATR (${atrPercent.toFixed(2)}%, need ${this.minATRPercent}%+)`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }

  public reset(): void {
    // Stateless strategy
  }
}
