import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateRSI, calculateEMA, calculateBollingerBands, calculateATR, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMIZED Mean Reversion Strategy
 *
 * TARGET: PROFITABLE with 0.35% per-trade costs
 *
 * APPROACH: Balance between quality and quantity
 * - Moderate filters for reasonable trade frequency
 * - High R:R (1:3) to ensure each winning trade covers losses + fees
 * - ATR-based dynamic stops
 *
 * Math for Profitability:
 * With 55% win rate and 1:3 R:R:
 * EV = (0.55 * 3%) - (0.45 * 1%) - 0.35% = 1.65% - 0.45% - 0.35% = +0.85% per trade
 */
export class OptimizedMeanReversionStrategy extends BaseStrategy {
  // Indicator periods
  private readonly rsiPeriod: number = 14;
  private readonly emaPeriod: number = 50;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;
  private readonly atrPeriod: number = 14;

  // Entry thresholds - RELAXED for more trades
  private readonly rsiOversoldThreshold: number = 35; // RSI below this = oversold
  private readonly rsiMinThreshold: number = 15; // Too low = crash, avoid

  // Risk Management - 1:3 R:R ratio
  private readonly atrStopLossMultiplier: number = 1.2; // 1.2 ATR stop
  private readonly atrTakeProfitMultiplier: number = 3.6; // 3.6 ATR take profit (1:3)

  constructor() {
    super('OptimizedMeanReversion');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.rsiPeriod, this.emaPeriod, this.bbPeriod, this.atrPeriod) + 20;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const ema = calculateEMA(candles, this.emaPeriod);
    const bb = calculateBollingerBands(candles, this.bbPeriod, this.bbStdDev);
    const atr = calculateATR(candles, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentEMA = ema[idx];
    const currentBBLower = bb.lower[idx];
    const currentATR = atr[idx];
    const currentCandle = candles[idx];

    // Validate
    if (currentRSI === 0 || currentEMA === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    const distanceFromEMA = ((currentPrice - currentEMA) / currentEMA) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS - Balanced for Trade Frequency
    // ═══════════════════════════════════════════════════════════

    // 1. RSI: Oversold but not crashing
    const isOversold = currentRSI <= this.rsiOversoldThreshold && currentRSI >= this.rsiMinThreshold;

    // 2. RSI: Turning up (momentum shifting)
    const rsiTurningUp = currentRSI > prevRSI;

    // 3. Price: At or below Bollinger Lower Band (or close to it)
    const nearBBLower = currentPrice <= currentBBLower * 1.01; // Within 1% of lower band

    // 4. Not in crash (within 8% of EMA50)
    const notCrashing = distanceFromEMA > -8;

    // 5. Bullish candle (reversal confirmation)
    const isBullish = currentCandle.close > currentCandle.open;

    // 6. Minimum volume (at least average)
    const hasVolume = volumeRatio >= 0.8;

    // ENTRY: All conditions
    const hasEntrySignal = isOversold && rsiTurningUp && nearBBLower && notCrashing && isBullish && hasVolume;

    if (hasEntrySignal) {
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
        reason: `OMR BUY: RSI ${currentRSI.toFixed(1)} uptick | BB lower | Vol ${volumeRatio.toFixed(1)}x [R:R 1:${rrRatio.toFixed(1)}]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for oversold bounce';
    if (!isOversold) {
      reason = `RSI ${currentRSI.toFixed(1)} not oversold (need <= ${this.rsiOversoldThreshold})`;
    } else if (!rsiTurningUp) {
      reason = `RSI falling. Wait for uptick.`;
    } else if (!nearBBLower) {
      reason = `Price not at BB lower ($${currentBBLower.toFixed(0)})`;
    } else if (!notCrashing) {
      reason = `Price too far below EMA50 (${distanceFromEMA.toFixed(1)}%)`;
    } else if (!isBullish) {
      reason = `Waiting for bullish candle`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
