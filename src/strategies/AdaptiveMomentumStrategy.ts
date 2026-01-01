import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, calculateMACD, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * ADAPTIVE MOMENTUM STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Adapts between MOMENTUM and MEAN REVERSION based on market conditions
 * - In trending markets (high ADX): Use momentum/breakout entries
 * - In ranging markets (low ADX): Use mean reversion entries
 * - Always uses high R:R to overcome costs
 *
 * ADVANTAGES:
 * - More trading opportunities by adapting to conditions
 * - Higher quality entries in appropriate market conditions
 * - Natural filtering of false signals
 *
 * Uses 4H timeframe for analysis, 1H for fine-tuning
 */
export class AdaptiveMomentumStrategy extends BaseStrategy {
  // Timeframes
  private readonly candlesPer1H: number = 60;
  private readonly candlesPer4H: number = 240;

  // ADX for regime detection
  private readonly adxPeriod: number = 14;
  private readonly trendThreshold: number = 25; // Above = trending, below = ranging

  // Momentum mode indicators
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;

  // Mean reversion mode indicators
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2.5;

  // Common indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;
  private readonly macdFast: number = 12;
  private readonly macdSlow: number = 26;
  private readonly macdSignal: number = 9;

  // Momentum mode thresholds
  private readonly momentumRSIMin: number = 50;
  private readonly momentumRSIMax: number = 70;
  private readonly momentumVolumeRatio: number = 1.5;

  // Mean reversion mode thresholds
  private readonly reversionRSIMax: number = 35;
  private readonly reversionVolumeRatio: number = 1.3;

  // Risk Management - HIGH R:R for both modes
  private readonly momentumSLMultiplier: number = 1.5;
  private readonly momentumTPMultiplier: number = 6.0; // 1:4 R:R
  private readonly reversionSLMultiplier: number = 2.0;
  private readonly reversionTPMultiplier: number = 5.0; // 1:2.5 R:R

  constructor() {
    super('AdaptiveMomentum');
  }

  private resampleToTimeframe(candles: Candle[], candlesPerPeriod: number): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + candlesPerPeriod <= candles.length; i += candlesPerPeriod) {
      const slice = candles.slice(i, i + candlesPerPeriod);
      resampled.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return resampled;
  }

  private checkMomentumEntry(
    candles4H: Candle[],
    currentPrice: number
  ): TradeSignal | null {
    const idx = candles4H.length - 1;

    // Calculate indicators
    const emaFast = calculateEMA(candles4H, this.emaFast);
    const emaMedium = calculateEMA(candles4H, this.emaMedium);
    const emaSlow = calculateEMA(candles4H, this.emaSlow);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const macd = calculateMACD(candles4H, this.macdFast, this.macdSlow, this.macdSignal);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const currentEMAFast = emaFast[idx];
    const currentEMAMedium = emaMedium[idx];
    const currentEMASlow = emaSlow[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const currentMACD = macd.macd[idx];
    const currentSignal = macd.signal[idx];
    const currentHistogram = macd.histogram[idx];
    const prevHistogram = macd.histogram[idx - 1];
    const currentCandle = candles4H[idx];

    // Momentum entry conditions
    const emaStack = currentEMAFast > currentEMAMedium && currentEMAMedium > currentEMASlow;
    const priceAboveEMA = currentPrice > currentEMAFast;
    const rsiHealthy = currentRSI >= this.momentumRSIMin && currentRSI <= this.momentumRSIMax;
    const rsiRising = currentRSI > prevRSI;
    const macdBullish = currentMACD > currentSignal && currentHistogram > prevHistogram;
    const hasVolume = volumeRatio >= this.momentumVolumeRatio;
    const bullishCandle = currentCandle.close > currentCandle.open;

    const hasEntry = emaStack && priceAboveEMA && rsiHealthy && rsiRising && macdBullish && hasVolume && bullishCandle;

    if (hasEntry) {
      const stopLoss = currentPrice - (currentATR * this.momentumSLMultiplier);
      const takeProfit = currentPrice + (currentATR * this.momentumTPMultiplier);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MOMENTUM: EMA stack | RSI ${currentRSI.toFixed(0)} | MACD+ | Vol ${volumeRatio.toFixed(1)}x`
      };
    }

    return null;
  }

  private checkReversionEntry(
    candles4H: Candle[],
    currentPrice: number
  ): TradeSignal | null {
    const idx = candles4H.length - 1;

    // Calculate indicators
    const bb = calculateBollingerBands(candles4H, this.bbPeriod, this.bbStdDev);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const ema = calculateEMA(candles4H, this.emaSlow);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const lowerBB = bb.lower[idx];
    const middleBB = bb.middle[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const currentEMA = ema[idx];
    const currentCandle = candles4H[idx];

    // Mean reversion entry conditions
    const belowLowerBB = currentPrice < lowerBB;
    const rsiOversold = currentRSI <= this.reversionRSIMax;
    const rsiTurning = currentRSI > prevRSI;
    const hasVolume = volumeRatio >= this.reversionVolumeRatio;
    const notInCrash = currentPrice > currentEMA * 0.85;

    // Hammer/rejection candle
    const candleBody = Math.abs(currentCandle.close - currentCandle.open);
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const hasRejection = lowerWick > candleBody * 1.5;

    const hasEntry = belowLowerBB && rsiOversold && rsiTurning && (hasVolume || hasRejection) && notInCrash;

    if (hasEntry) {
      const stopLoss = currentPrice - (currentATR * this.reversionSLMultiplier);
      const takeProfit = currentPrice + (currentATR * this.reversionTPMultiplier);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `REVERSION: Below BB | RSI ${currentRSI.toFixed(0)} turning | Vol ${volumeRatio.toFixed(1)}x`
      };
    }

    return null;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.emaSlow + 20) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleToTimeframe(candles, this.candlesPer4H);
    if (candles4H.length < this.emaSlow + 15) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Determine market regime using ADX
    const adx = calculateADX(candles4H, this.adxPeriod);
    const idx = candles4H.length - 1;
    const currentADX = adx[idx];

    if (currentADX === 0) {
      return { action: 'hold', price: currentPrice, reason: 'ADX not ready' };
    }

    // ═══════════════════════════════════════════════════════════
    // ADAPTIVE MODE SELECTION
    // ═══════════════════════════════════════════════════════════

    const isTrending = currentADX >= this.trendThreshold;

    if (isTrending) {
      // MOMENTUM MODE
      const signal = this.checkMomentumEntry(candles4H, currentPrice);
      if (signal) {
        return signal;
      }
      return {
        action: 'hold',
        price: currentPrice,
        reason: `MOMENTUM mode (ADX ${currentADX.toFixed(0)}): Waiting for entry`
      };
    } else {
      // MEAN REVERSION MODE
      const signal = this.checkReversionEntry(candles4H, currentPrice);
      if (signal) {
        return signal;
      }
      return {
        action: 'hold',
        price: currentPrice,
        reason: `REVERSION mode (ADX ${currentADX.toFixed(0)}): Waiting for oversold`
      };
    }
  }

  public reset(): void {}
}
