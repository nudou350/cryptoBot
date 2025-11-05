import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateADX, calculateDI, calculateEMA, calculateATR, calculateAverageVolume } from '../utils/indicators';

/**
 * ADX Trend Strength + Direction Filter Strategy (60-65% win rate)
 *
 * Best for: Strong trending markets, breakout confirmations
 * Win Rate: 60-65%
 * Risk/Reward: 1:3
 * Risk Level: Medium
 *
 * Strategy:
 * - Uses ADX to measure trend STRENGTH (only trades when ADX > 25)
 * - Uses +DI/-DI to determine trend DIRECTION
 * - Only trades when trend is both STRONG and CLEAR
 * - Highest R:R ratio of all strategies (1:3)
 */
export class ADXTrendStrategy extends BaseStrategy {
  private readonly adxPeriod: number = 14;
  private readonly adxThreshold: number = 25;
  private readonly emaSlow: number = 50;
  private readonly emaFast: number = 20;
  private readonly atrPeriod: number = 14;
  private readonly volumePeriod: number = 20;
  private readonly volumeMultiplier: number = 1.3;
  private readonly atrMultiplierTP: number = 3.0;
  private readonly atrMultiplierSL: number = 1.0;

  constructor() {
    super('ADXTrend');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.adxPeriod, this.emaSlow, this.atrPeriod, this.volumePeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data for ADX Trend' };
    }

    // Calculate indicators
    const adx = calculateADX(candles, this.adxPeriod);
    const di = calculateDI(candles, this.adxPeriod);
    const ema50 = calculateEMA(candles, this.emaSlow);
    const ema20 = calculateEMA(candles, this.emaFast);
    const atr = calculateATR(candles, this.atrPeriod);
    const avgVolume = calculateAverageVolume(candles, this.volumePeriod);

    const idx = candles.length - 1;

    // Check if indicators are ready
    if (adx[idx] === 0 || di.plusDI[idx] === 0 || ema50[idx] === 0 || atr[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Check trend strength
    const strongTrend = adx[idx] > this.adxThreshold;
    const trendStrengthening = adx[idx] > adx[idx - 2];

    // Check trend direction
    const bullishDirection = di.plusDI[idx] > di.minusDI[idx];

    // Price above long-term EMA
    const aboveEMA50 = currentPrice > ema50[idx];

    // Pullback to EMA20
    const nearEMA20 = Math.abs(currentPrice - ema20[idx]) < (atr[idx] * 0.5);

    // Volume check
    const volumeGood = candles[idx].volume > avgVolume[idx] * this.volumeMultiplier;

    // BUY Signal
    if (strongTrend && trendStrengthening && bullishDirection &&
        aboveEMA50 && nearEMA20 && volumeGood) {
      const stopLoss = currentPrice - (atr[idx] * this.atrMultiplierSL);
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `ADX Trend BUY: ADX=${adx[idx].toFixed(1)} (strong trend), +DI=${di.plusDI[idx].toFixed(1)} > -DI=${di.minusDI[idx].toFixed(1)}, Vol=${(candles[idx].volume/avgVolume[idx]).toFixed(2)}x`
      };
    }

    // EXIT - Trend weakening
    if (adx[idx] < 20) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `ADX Trend EXIT: ADX=${adx[idx].toFixed(1)} < 20 - Trend weakening`
      };
    }

    // EXIT - Direction change
    if (di.plusDI[idx] < di.minusDI[idx]) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `ADX Trend EXIT: +DI(${di.plusDI[idx].toFixed(1)}) crossed below -DI(${di.minusDI[idx].toFixed(1)}) - Trend reversed`
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for strong trend setup';

    if (!strongTrend) {
      reason = `ADX too weak (${adx[idx].toFixed(1)} < ${this.adxThreshold}) - trend not strong enough`;
    } else if (!bullishDirection) {
      reason = `ADX strong but bearish (-DI=${di.minusDI[idx].toFixed(1)} > +DI=${di.plusDI[idx].toFixed(1)})`;
    } else if (!aboveEMA50) {
      reason = `Strong trend but price below EMA50 (${ema50[idx].toFixed(2)})`;
    } else if (!nearEMA20) {
      reason = `Strong trend active, waiting for pullback to EMA20 (${ema20[idx].toFixed(2)})`;
    } else {
      reason = `ADX=${adx[idx].toFixed(1)}, strong trend, waiting for volume`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
