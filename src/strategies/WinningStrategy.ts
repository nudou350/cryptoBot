import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateATR, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * WINNING STRATEGY - Designed to be PROFITABLE
 *
 * KEY INSIGHT: With 1-minute data and 0.35% round-trip cost,
 * we need trades that can actually REACH the take profit before
 * hitting stop loss.
 *
 * APPROACH:
 * 1. Use PERCENTAGE-BASED fixed stops (not ATR) for predictability
 * 2. Stop Loss: 1.5% (includes slippage/fees - actual risk ~1.85%)
 * 3. Take Profit: 4.5% (3:1 R:R ratio, actual ~4.15% after costs)
 * 4. Need >35% win rate to be profitable: 0.35*4.15 - 0.65*1.85 = 0.25%
 *
 * ENTRY: Extreme oversold conditions with bullish reversal confirmation
 * - RSI < 30 and turning up
 * - Price below Bollinger Band lower
 * - Strong bullish candle (reversal)
 * - Volume confirmation
 *
 * Why this works:
 * - 4.5% TP gives room for the trade to develop (not hit immediately)
 * - 1.5% SL is tight enough to limit losses but not so tight it's hit by noise
 * - Oversold bounces in crypto tend to be sharp and strong
 */
export class WinningStrategy extends BaseStrategy {
  // Indicators
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // Entry thresholds
  private readonly rsiOversold: number = 30;
  private readonly rsiMinimum: number = 10; // Avoid extreme crashes

  // Risk Management - PERCENTAGE BASED
  private readonly stopLossPercent: number = 1.5; // 1.5% stop loss
  private readonly takeProfitPercent: number = 4.5; // 4.5% take profit (1:3 R:R)

  // Minimum time between trades (candles) to prevent overtrading
  private lastEntryCandle: number = 0;
  private readonly minCandlesBetweenTrades: number = 60; // 1 hour minimum

  constructor() {
    super('WinningStrategy');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.emaPeriod, this.bbPeriod) + 20;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const currentCandleIndex = candles.length - 1;

    // Check cooldown
    if (currentCandleIndex - this.lastEntryCandle < this.minCandlesBetweenTrades) {
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Cooldown: ${this.minCandlesBetweenTrades - (currentCandleIndex - this.lastEntryCandle)} candles remaining`
      };
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
    const prevCandle = candles[idx - 1];

    // Validate
    if (currentRSI === 0 || currentEMA === 0 || currentBBLower === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS - High quality oversold bounces only
    // ═══════════════════════════════════════════════════════════

    // 1. RSI oversold (but not crashing)
    const rsiOversold = currentRSI <= this.rsiOversold && currentRSI >= this.rsiMinimum;

    // 2. RSI turning up (momentum shift)
    const rsiTurningUp = currentRSI > prevRSI;

    // 3. Price at or below Bollinger lower band
    const atBBLower = currentPrice <= currentBBLower * 1.005;

    // 4. Strong bullish candle (reversal confirmation)
    const bodySize = Math.abs(currentCandle.close - currentCandle.open);
    const candleRange = currentCandle.high - currentCandle.low;
    const isBullish = currentCandle.close > currentCandle.open;
    const isStrongBullish = isBullish && candleRange > 0 && (bodySize / candleRange) > 0.5;

    // 5. Previous candle was bearish (confirms this is a reversal)
    const prevWasBearish = prevCandle.close < prevCandle.open;

    // 6. Volume confirmation
    const hasVolume = volumeRatio >= 1.0;

    // 7. Not too far from EMA (avoid crashes)
    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;
    const notCrashing = distanceFromEMA > -8;

    // ENTRY SIGNAL
    const hasEntrySignal =
      rsiOversold &&
      rsiTurningUp &&
      atBBLower &&
      isStrongBullish &&
      prevWasBearish &&
      hasVolume &&
      notCrashing;

    if (hasEntrySignal) {
      // Fixed percentage stops
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      // Record entry to prevent immediate re-entry
      this.lastEntryCandle = currentCandleIndex;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `WIN BUY: RSI ${currentRSI.toFixed(1)} | BB low | Bullish reversal | Vol ${volumeRatio.toFixed(1)}x [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for oversold reversal';
    if (!rsiOversold) {
      reason = `RSI ${currentRSI.toFixed(1)} not oversold (need <= ${this.rsiOversold})`;
    } else if (!rsiTurningUp) {
      reason = `RSI still falling (${prevRSI.toFixed(1)} -> ${currentRSI.toFixed(1)})`;
    } else if (!atBBLower) {
      reason = `Price not at BB lower ($${currentBBLower.toFixed(0)})`;
    } else if (!isStrongBullish) {
      reason = isBullish ? `Weak bullish candle` : `Bearish candle`;
    } else if (!prevWasBearish) {
      reason = `No bearish-to-bullish reversal pattern`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    } else if (!notCrashing) {
      reason = `Too far below EMA (${distanceFromEMA.toFixed(1)}%) - crash avoidance`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {
    this.lastEntryCandle = 0;
  }
}
