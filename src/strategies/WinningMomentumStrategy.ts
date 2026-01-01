import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateMACD, getVolumeRatio } from '../utils/indicators';

/**
 * WINNING MOMENTUM STRATEGY - Catch momentum moves
 *
 * APPROACH: Fresh MACD bullish crossovers with volume surge
 * - Enter when momentum is just starting
 * - Use moderate stops (1.8%) and targets (5.4%) for 1:3 R:R
 * - Strict volume requirements to confirm real momentum
 *
 * Math: With 45% win rate and 1:3 R:R:
 * 0.45 * 5.4% - 0.55 * 1.8% - 0.35% = 2.43% - 0.99% - 0.35% = +1.09%
 */
export class WinningMomentumStrategy extends BaseStrategy {
  // EMAs
  private readonly emaFast: number = 12;
  private readonly emaSlow: number = 26;
  private readonly emaSignal: number = 50; // For trend context

  // MACD
  private readonly macdFast: number = 12;
  private readonly macdSlow: number = 26;
  private readonly macdSignal: number = 9;

  // RSI
  private readonly rsiPeriod: number = 14;
  private readonly rsiMin: number = 45;
  private readonly rsiMax: number = 70;

  // Risk Management
  private readonly stopLossPercent: number = 1.8;
  private readonly takeProfitPercent: number = 5.4; // 1:3

  // Trade cooldown
  private lastEntryCandle: number = 0;
  private readonly minCandlesBetweenTrades: number = 90; // 1.5 hours

  constructor() {
    super('WinningMomentum');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaSignal, this.macdSlow + this.macdSignal) + 20;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const currentCandleIndex = candles.length - 1;

    if (currentCandleIndex - this.lastEntryCandle < this.minCandlesBetweenTrades) {
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Cooldown: ${this.minCandlesBetweenTrades - (currentCandleIndex - this.lastEntryCandle)} candles`
      };
    }

    // Calculate indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const emaSlowArr = calculateEMA(candles, this.emaSlow);
    const emaSignalArr = calculateEMA(candles, this.emaSignal);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const macd = calculateMACD(candles, this.macdFast, this.macdSlow, this.macdSignal);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const emaFast = emaFastArr[idx];
    const emaSlow = emaSlowArr[idx];
    const ema50 = emaSignalArr[idx];
    const currentRSI = rsi[idx];
    const macdLine = macd.macd[idx];
    const signalLine = macd.signal[idx];
    const prevMacdLine = macd.macd[idx - 1];
    const prevSignalLine = macd.signal[idx - 1];
    const histogram = macd.histogram[idx];
    const prevHistogram = macd.histogram[idx - 1];
    const currentCandle = candles[idx];

    // Validate
    if (emaFast === 0 || emaSlow === 0 || ema50 === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // MOMENTUM DETECTION
    // ═══════════════════════════════════════════════════════════

    // 1. Fresh MACD bullish crossover (just happened)
    const freshCrossover = prevMacdLine <= prevSignalLine && macdLine > signalLine;

    // 2. MACD above zero (established momentum)
    const macdPositive = macdLine > 0;

    // 3. Histogram growing (momentum accelerating)
    const histogramGrowing = histogram > prevHistogram && histogram > 0;

    // 4. Price above EMAs
    const priceAboveEMAs = currentPrice > emaFast && currentPrice > emaSlow;

    // 5. EMA alignment
    const emaAligned = emaFast > emaSlow;

    // 6. Price above EMA50 (trend context)
    const aboveEMA50 = currentPrice > ema50;

    // 7. RSI in healthy zone
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 8. Strong bullish candle
    const isBullish = currentCandle.close > currentCandle.open;
    const bodySize = Math.abs(currentCandle.close - currentCandle.open);
    const range = currentCandle.high - currentCandle.low;
    const strongBullish = isBullish && range > 0 && (bodySize / range) > 0.5;

    // 9. Volume surge (important for momentum)
    const volumeSurge = volumeRatio >= 1.5;

    // ENTRY SIGNAL
    const hasMomentum = freshCrossover && macdPositive && histogramGrowing;
    const hasContext = priceAboveEMAs && emaAligned && aboveEMA50 && rsiHealthy;
    const hasConfirmation = strongBullish && volumeSurge;

    const hasEntrySignal = hasMomentum && hasContext && hasConfirmation;

    if (hasEntrySignal) {
      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      this.lastEntryCandle = currentCandleIndex;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MOM BUY: MACD cross | RSI ${currentRSI.toFixed(1)} | Vol ${volumeRatio.toFixed(1)}x [SL -${this.stopLossPercent}% / TP +${this.takeProfitPercent}%]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for MACD crossover';
    if (!freshCrossover) {
      reason = `No fresh MACD crossover`;
    } else if (!macdPositive) {
      reason = `MACD below zero`;
    } else if (!histogramGrowing) {
      reason = `Histogram not growing`;
    } else if (!priceAboveEMAs) {
      reason = `Price below EMAs`;
    } else if (!emaAligned) {
      reason = `EMA12 < EMA26`;
    } else if (!aboveEMA50) {
      reason = `Price below EMA50`;
    } else if (!rsiHealthy) {
      reason = `RSI ${currentRSI.toFixed(1)} outside range (${this.rsiMin}-${this.rsiMax})`;
    } else if (!strongBullish) {
      reason = `Weak or bearish candle`;
    } else if (!volumeSurge) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x, need 1.5x)`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {
    this.lastEntryCandle = 0;
  }
}
