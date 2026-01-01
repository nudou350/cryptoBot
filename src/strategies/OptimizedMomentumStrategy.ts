import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR, calculateMACD, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMIZED Momentum Strategy
 *
 * TARGET: PROFITABLE with 0.35% per-trade costs
 *
 * APPROACH: Catch momentum breakouts with MACD confirmation
 * - MACD crossover for momentum signal
 * - RSI not overbought (room to run)
 * - Price above EMAs (trend confirmation)
 * - High R:R (1:3) for profitability
 *
 * Math for Profitability:
 * With 50% win rate and 1:3 R:R:
 * EV = (0.50 * 3%) - (0.50 * 1%) - 0.35% = 1.5% - 0.5% - 0.35% = +0.65% per trade
 */
export class OptimizedMomentumStrategy extends BaseStrategy {
  // EMA periods
  private readonly emaFast: number = 12;
  private readonly emaSlow: number = 26;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // MACD parameters
  private readonly macdFast: number = 12;
  private readonly macdSlow: number = 26;
  private readonly macdSignal: number = 9;

  // Entry thresholds
  private readonly rsiMin: number = 40; // Not oversold
  private readonly rsiMax: number = 70; // Not overbought

  // Risk Management - 1:3 R:R ratio
  private readonly atrStopLossMultiplier: number = 1.2; // 1.2 ATR stop
  private readonly atrTakeProfitMultiplier: number = 3.6; // 3.6 ATR take profit

  constructor() {
    super('OptimizedMomentum');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaSlow, this.macdSlow + this.macdSignal, this.atrPeriod) + 20;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const emaSlowArr = calculateEMA(candles, this.emaSlow);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const atr = calculateATR(candles, this.atrPeriod);
    const macd = calculateMACD(candles, this.macdFast, this.macdSlow, this.macdSignal);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const currentEMAFast = emaFastArr[idx];
    const currentEMASlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const currentATR = atr[idx];
    const currentMACD = macd.macd[idx];
    const currentSignal = macd.signal[idx];
    const prevMACD = macd.macd[idx - 1];
    const prevSignal = macd.signal[idx - 1];
    const currentCandle = candles[idx];

    // Validate
    if (currentEMAFast === 0 || currentEMASlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. MACD bullish crossover (fresh momentum)
    const macdCrossover = prevMACD <= prevSignal && currentMACD > currentSignal;

    // 2. MACD above zero line (established uptrend)
    const macdPositive = currentMACD > 0;

    // 3. Price above both EMAs
    const priceAboveEMAs = currentPrice > currentEMAFast && currentPrice > currentEMASlow;

    // 4. EMA alignment
    const emaAligned = currentEMAFast > currentEMASlow;

    // 5. RSI in healthy zone
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 6. Bullish candle
    const isBullish = currentCandle.close > currentCandle.open;

    // 7. Volume confirmation
    const hasVolume = volumeRatio >= 1.0;

    // ENTRY: Fresh MACD crossover with confirmation
    const hasEntrySignal = macdCrossover && macdPositive && priceAboveEMAs &&
      emaAligned && rsiHealthy && isBullish && hasVolume;

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
        reason: `OMom BUY: MACD crossover | RSI ${currentRSI.toFixed(1)} | Vol ${volumeRatio.toFixed(1)}x [R:R 1:${rrRatio.toFixed(1)}]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for MACD crossover';
    if (!macdCrossover) {
      reason = `No fresh MACD crossover`;
    } else if (!macdPositive) {
      reason = `MACD below zero. Wait for established uptrend.`;
    } else if (!priceAboveEMAs) {
      reason = `Price below EMAs`;
    } else if (!emaAligned) {
      reason = `EMA12 < EMA26. No uptrend.`;
    } else if (!rsiHealthy) {
      if (currentRSI > this.rsiMax) {
        reason = `RSI ${currentRSI.toFixed(1)} overbought`;
      } else {
        reason = `RSI ${currentRSI.toFixed(1)} too low`;
      }
    } else if (!isBullish) {
      reason = `Waiting for bullish candle`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
