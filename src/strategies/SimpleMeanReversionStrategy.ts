import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * SIMPLE MEAN REVERSION STRATEGY
 *
 * Simplified mean reversion with fewer conditions.
 * Uses 4H timeframe.
 *
 * Entry conditions:
 * 1. RSI below 40 (oversold)
 * 2. Price at or below lower Bollinger Band
 * 3. RSI turning up
 *
 * Uses 1:2 R:R
 */
export class SimpleMeanReversionStrategy extends BaseStrategy {
  // Timeframe: 4H
  private readonly candlesPer4H: number = 240;

  // Indicators
  private readonly rsiPeriod: number = 14;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;
  private readonly atrPeriod: number = 14;
  private readonly emaPeriod: number = 50;

  // Entry thresholds
  private readonly rsiOversold: number = 40;
  private readonly rsiMinimum: number = 15;

  // Risk Management
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 4.0; // 1:2 R:R

  constructor() {
    super('SimpleMeanReversion');
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

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.emaPeriod + 10) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.emaPeriod + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const bb = calculateBollingerBands(candles4H, this.bbPeriod, this.bbStdDev);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const ema = calculateEMA(candles4H, this.emaPeriod);

    const idx = candles4H.length - 1;
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const lowerBB = bb.lower[idx];
    const currentATR = atr[idx];
    const currentEMA = ema[idx];

    if (currentRSI === 0 || lowerBB === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Entry conditions
    // 1. RSI oversold
    const isOversold = currentRSI <= this.rsiOversold && currentRSI >= this.rsiMinimum;

    // 2. Price at or below lower BB
    const atLowerBB = currentPrice <= lowerBB * 1.02; // 2% tolerance

    // 3. RSI turning up
    const rsiTurningUp = currentRSI > prevRSI;

    // 4. Not in crash (price within 10% of EMA)
    const notInCrash = currentPrice > currentEMA * 0.90;

    // ENTRY
    const hasEntry = isOversold && atLowerBB && rsiTurningUp && notInCrash;

    if (hasEntry) {
      const stopLoss = currentPrice - (currentATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (currentATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `REVERSION: RSI ${currentRSI.toFixed(0)} oversold | At BB lower | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!isOversold) reason = `RSI ${currentRSI.toFixed(0)} not oversold`;
    else if (!atLowerBB) reason = 'Above lower BB';
    else if (!rsiTurningUp) reason = 'RSI falling';
    else if (!notInCrash) reason = 'Crash territory';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
