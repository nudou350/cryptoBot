import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * BALANCED Mean Reversion Strategy
 *
 * GOAL: Find the sweet spot between too many trades and too few trades
 *
 * KEY PRINCIPLES:
 * 1. Moderate entry filters - not too strict, not too loose
 * 2. Fixed percentage stops that work with 1-minute candles
 * 3. No internal cooldown (let backtesting engine handle position management)
 * 4. Focus on WIN RATE over R:R ratio
 *
 * TARGET: 60%+ win rate with 1:1.5 R:R = profitable after fees
 * Math: 0.60 * 1.5% - 0.40 * 1.0% - 0.35% = 0.9% - 0.4% - 0.35% = +0.15% per trade
 *
 * With this strategy we aim for:
 * - ~10-20 trades per month
 * - 60%+ win rate
 * - Small but consistent profits
 */
export class BalancedMeanReversionStrategy extends BaseStrategy {
  // Indicators
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // Entry: Oversold conditions (relaxed thresholds)
  private readonly rsiOversold: number = 35; // Below 35 is oversold
  private readonly rsiMinimum: number = 15; // Avoid extreme crashes

  // Risk Management
  private readonly stopLossPercent: number = 1.0; // 1% stop loss
  private readonly takeProfitPercent: number = 1.5; // 1.5% take profit (1:1.5 R:R)

  constructor() {
    super('BalancedMeanReversion');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.emaPeriod, this.bbPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const ema = calculateEMA(candles, this.emaPeriod);
    const bb = calculateBollingerBands(candles, this.bbPeriod, this.bbStdDev);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentEMA = ema[idx];
    const currentBBLower = bb.lower[idx];
    const currentCandle = candles[idx];

    // Validate
    if (currentRSI === 0 || currentEMA === 0 || currentBBLower === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS - Balanced (not too strict, not too loose)
    // ═══════════════════════════════════════════════════════════

    // 1. RSI oversold but not crashing
    const isOversold = currentRSI <= this.rsiOversold && currentRSI >= this.rsiMinimum;

    // 2. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 3. Near or below Bollinger lower
    const nearBBLower = currentPrice <= currentBBLower * 1.02; // Within 2% of lower band

    // 4. Not too far from EMA
    const notCrashing = distanceFromEMA > -6; // Max 6% below EMA50

    // 5. Bullish candle
    const isBullish = currentCandle.close > currentCandle.open;

    // ENTRY: Core conditions
    const hasEntrySignal = isOversold && rsiTurningUp && nearBBLower && notCrashing && isBullish;

    if (hasEntrySignal) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `BMR BUY: RSI ${currentRSI.toFixed(1)} | Near BB [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD
    let reason = 'Waiting';
    if (!isOversold) {
      reason = `RSI ${currentRSI.toFixed(1)} > ${this.rsiOversold}`;
    } else if (!rsiTurningUp) {
      reason = `RSI falling`;
    } else if (!nearBBLower) {
      reason = `Above BB lower`;
    } else if (!notCrashing) {
      reason = `Too far below EMA (${distanceFromEMA.toFixed(1)}%)`;
    } else if (!isBullish) {
      reason = `Bearish candle`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
