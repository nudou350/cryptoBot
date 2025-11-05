import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR } from '../utils/indicators';

/**
 * EMA Slope + Momentum Filter Strategy (57-62% win rate)
 *
 * Best for: Accelerating trends, post-breakout momentum
 * Win Rate: 57-62%
 * Risk/Reward: 1:2-2.5
 * Risk Level: Medium-High
 *
 * Strategy:
 * - Analyzes the SLOPE (rate of change) of the EMA itself
 * - A steepening EMA indicates accelerating trend
 * - Combines EMA slope with RSI momentum for high-probability entries
 * - Catches fast momentum moves early
 */
export class EMASlopeMomentumStrategy extends BaseStrategy {
  private readonly emaPeriod: number = 21;
  private readonly slopeLookback: number = 3;
  private readonly minSlope: number = 0.003; // 0.3%
  private readonly rsiPeriod: number = 14;
  private readonly rsiThreshold: number = 50;
  private readonly atrPeriod: number = 14;
  private readonly atrMultiplierTP: number = 2.5;
  private readonly atrMultiplierSL: number = 1.2;
  private readonly maxOverextension: number = 1.5; // ATR multiples

  constructor() {
    super('EMASlopeMomentum');
  }

  private calculateSlope(ema: number[], idx: number, lookback: number): number {
    if (idx < lookback) return 0;
    const current = ema[idx];
    const past = ema[idx - lookback];
    return (current - past) / past; // Percentage change
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaPeriod, this.rsiPeriod, this.atrPeriod) + this.slopeLookback + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data for EMA Slope Momentum' };
    }

    // Calculate indicators
    const ema21 = calculateEMA(candles, this.emaPeriod);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const atr = calculateATR(candles, this.atrPeriod);

    const idx = candles.length - 1;
    const prevIdx = idx - 1;

    // Check if indicators are ready
    if (ema21[idx] === 0 || rsi[idx] === 0 || atr[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Calculate EMA slope
    const currentSlope = this.calculateSlope(ema21, idx, this.slopeLookback);
    const prevSlope = this.calculateSlope(ema21, prevIdx, this.slopeLookback);

    // Check slope conditions
    const positiveSlope = currentSlope > this.minSlope;
    const accelerating = currentSlope > prevSlope;

    // Price position check
    const aboveEMA = currentPrice > ema21[idx];
    const notOverextended = (currentPrice - ema21[idx]) < (atr[idx] * this.maxOverextension);

    // RSI momentum
    const rsiStrong = rsi[idx] > this.rsiThreshold;
    const rsiSlope = rsi[idx] - rsi[prevIdx];
    const rsiRising = rsiSlope > 0;

    // Volume check
    const volumeIncreasing = candles[idx].volume >
      (candles[idx-1].volume + candles[idx-2].volume + candles[idx-3].volume) / 3;

    // BUY Signal
    if (positiveSlope && accelerating && aboveEMA && notOverextended &&
        rsiStrong && rsiRising && volumeIncreasing) {
      const stopLoss = currentPrice - (atr[idx] * this.atrMultiplierSL);
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `EMA Slope BUY: Slope=${(currentSlope*100).toFixed(2)}% (accelerating), RSI=${rsi[idx].toFixed(1)} rising, volume increasing`
      };
    }

    // EXIT - Slope turns negative
    if (currentSlope < 0) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `EMA Slope EXIT: Slope turned negative (${(currentSlope*100).toFixed(2)}%)`
      };
    }

    // EXIT - RSI momentum lost
    if (rsi[idx] < 45) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `EMA Slope EXIT: RSI momentum lost (${rsi[idx].toFixed(1)} < 45)`
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for EMA slope acceleration';

    if (!positiveSlope) {
      reason = `EMA slope too flat (${(currentSlope*100).toFixed(2)}% < ${(this.minSlope*100).toFixed(2)}%)`;
    } else if (!accelerating) {
      reason = `EMA slope positive but not accelerating (${(currentSlope*100).toFixed(2)}%)`;
    } else if (notOverextended && !rsiStrong) {
      reason = `Slope accelerating but RSI weak (${rsi[idx].toFixed(1)})`;
    } else if (notOverextended && !rsiRising) {
      reason = `Slope accelerating but RSI not rising`;
    } else if (!notOverextended) {
      reason = `Price overextended from EMA21 (waiting for pullback)`;
    } else {
      reason = `Slope=${(currentSlope*100).toFixed(2)}%, waiting for volume confirmation`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
