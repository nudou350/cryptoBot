import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateBollingerBands, calculateMACD, getVolumeRatio } from '../utils/indicators';

/**
 * VOLATILITY SQUEEZE STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Identify when Bollinger Bands squeeze inside Keltner Channels (classic squeeze)
 * - Wait for momentum to build (MACD histogram positive and growing)
 * - Enter when squeeze fires (BB expands outside KC)
 * - Very high R:R (1:5) because these are rare, high-probability setups
 *
 * MATH:
 * - If win rate 35% with 1:5 R:R:
 *   - Win: 0.35 * 10% = 3.5%
 *   - Loss: 0.65 * 2% = 1.3%
 *   - Costs: 0.35%
 *   - Net per trade: 3.5% - 1.3% - 0.35% = 1.85%
 * - Need ~20 trades over 730 days for 37% = 1 trade every 36 days
 *
 * Uses 4H timeframe for significant setups
 */
export class VolatilitySqueezeStrategy extends BaseStrategy {
  // Timeframe: 4H
  private readonly candlesPer4H: number = 240;

  // Bollinger Bands
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2.0;

  // Keltner Channels
  private readonly kcPeriod: number = 20;
  private readonly kcATRMultiplier: number = 1.5;

  // Other indicators
  private readonly macdFast: number = 12;
  private readonly macdSlow: number = 26;
  private readonly macdSignal: number = 9;
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds
  private readonly minSqueezeCandles: number = 6; // At least 6 4H candles (1 day) in squeeze
  private readonly minVolumeRatio: number = 1.5;
  private readonly rsiMin: number = 45;
  private readonly rsiMax: number = 70;

  // Risk Management - VERY HIGH R:R
  private readonly stopLossATRMultiplier: number = 1.5;
  private readonly takeProfitATRMultiplier: number = 7.5; // 1:5 R:R

  // State tracking
  private squeezeCount: number = 0;
  private wasInSqueeze: boolean = false;

  constructor() {
    super('VolatilitySqueeze');
  }

  private resampleTo4H(candles: Candle[]): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + this.candlesPer4H <= candles.length; i += this.candlesPer4H) {
      const slice = candles.slice(i, i + this.candlesPer4H);
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

  private calculateKeltnerChannels(candles: Candle[]): { upper: number[], middle: number[], lower: number[] } {
    const ema = calculateEMA(candles, this.kcPeriod);
    const atr = calculateATR(candles, this.kcPeriod);

    const upper = ema.map((e, i) => e + (atr[i] * this.kcATRMultiplier));
    const lower = ema.map((e, i) => e - (atr[i] * this.kcATRMultiplier));

    return { upper, middle: ema, lower };
  }

  private isInSqueeze(bbUpper: number, bbLower: number, kcUpper: number, kcLower: number): boolean {
    // Squeeze: BB is inside KC (low volatility compression)
    return bbUpper < kcUpper && bbLower > kcLower;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.macdSlow + 20) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.macdSlow + 15) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const bb = calculateBollingerBands(candles4H, this.bbPeriod, this.bbStdDev);
    const kc = this.calculateKeltnerChannels(candles4H);
    const macd = calculateMACD(candles4H, this.macdFast, this.macdSlow, this.macdSignal);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const ema21 = calculateEMA(candles4H, 21);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const idx = candles4H.length - 1;
    const currentCandle = candles4H[idx];

    // Current values
    const bbUpper = bb.upper[idx];
    const bbLower = bb.lower[idx];
    const kcUpper = kc.upper[idx];
    const kcLower = kc.lower[idx];
    const currentMACD = macd.macd[idx];
    const currentSignal = macd.signal[idx];
    const currentHistogram = macd.histogram[idx];
    const prevHistogram = macd.histogram[idx - 1];
    const currentRSI = rsi[idx];
    const currentATR = atr[idx];
    const currentEMA = ema21[idx];

    if (bbUpper === 0 || kcUpper === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Check current squeeze state
    const inSqueeze = this.isInSqueeze(bbUpper, bbLower, kcUpper, kcLower);

    // Track squeeze duration
    if (inSqueeze) {
      this.squeezeCount++;
      this.wasInSqueeze = true;
    }

    // ═══════════════════════════════════════════════════════════
    // SQUEEZE FIRE DETECTION
    // ═══════════════════════════════════════════════════════════

    // Squeeze fires when BB expands outside KC after being inside
    const squeezeJustFired = this.wasInSqueeze && !inSqueeze && this.squeezeCount >= this.minSqueezeCandles;

    // 1. Squeeze just fired
    // 2. MACD histogram positive and growing (bullish momentum)
    const bullishMomentum = currentHistogram > 0 && currentHistogram > prevHistogram;

    // 3. MACD above signal (bullish crossover happened)
    const macdAboveSignal = currentMACD > currentSignal;

    // 4. RSI in healthy range
    const rsiHealthy = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 5. Price above EMA
    const aboveEMA = currentPrice > currentEMA;

    // 6. Bullish candle
    const bullishCandle = currentCandle.close > currentCandle.open;

    // 7. Volume confirmation
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 8. Price broke above BB upper (confirming expansion)
    const priceAboveUpperBB = currentPrice > bbUpper;

    // ENTRY CONDITIONS
    const hasEntry = squeezeJustFired && bullishMomentum && macdAboveSignal &&
                     rsiHealthy && aboveEMA && bullishCandle && hasVolume && priceAboveUpperBB;

    if (hasEntry) {
      // Reset state
      this.squeezeCount = 0;
      this.wasInSqueeze = false;

      // ATR-based stops
      const stopLoss = currentPrice - (currentATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (currentATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `SQUEEZE FIRE: ${this.squeezeCount} bars | MACD+ | RSI ${currentRSI.toFixed(0)} | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    // Reset squeeze tracking if conditions not met after squeeze fired
    if (!inSqueeze && this.wasInSqueeze && !hasEntry) {
      // Give it one candle to fire, then reset
      if (this.squeezeCount > 0) {
        this.squeezeCount = 0;
        this.wasInSqueeze = false;
      }
    }

    // Build reason
    let reason = 'Waiting for squeeze';
    if (inSqueeze) {
      reason = `In squeeze: ${this.squeezeCount}/${this.minSqueezeCandles}`;
    } else if (this.wasInSqueeze) {
      if (!bullishMomentum) reason = 'Squeeze fired but no momentum';
      else if (!macdAboveSignal) reason = 'MACD bearish';
      else if (!rsiHealthy) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
      else if (!hasVolume) reason = `Low volume: ${volumeRatio.toFixed(1)}x`;
      else if (!priceAboveUpperBB) reason = 'Price not above BB';
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {
    this.squeezeCount = 0;
    this.wasInSqueeze = false;
  }
}
