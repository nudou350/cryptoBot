import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, getVolumeRatio } from '../utils/indicators';

/**
 * HIGH FREQUENCY TREND STRATEGY
 *
 * Uses 1H timeframe for more trading opportunities.
 * Trades with the trend, using smaller timeframe for entries.
 *
 * Entry conditions:
 * 1. Fast EMA > Medium EMA > Slow EMA (triple EMA stack)
 * 2. Price above fast EMA
 * 3. RSI 45-65 (healthy momentum)
 *
 * Uses moderate R:R (1:2) with tighter stops
 */
export class HighFrequencyTrendStrategy extends BaseStrategy {
  // Timeframe: 1H
  private readonly candlesPer1H: number = 60;

  // EMAs
  private readonly emaFast: number = 8;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds
  private readonly rsiMin: number = 45;
  private readonly rsiMax: number = 65;

  // Risk Management - Moderate R:R for more frequent trades
  private readonly stopLossATRMultiplier: number = 1.5;
  private readonly takeProfitATRMultiplier: number = 3.0; // 1:2 R:R

  constructor() {
    super('HighFrequencyTrend');
  }

  private resampleTo1H(candles: Candle[]): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + this.candlesPer1H <= candles.length; i += this.candlesPer1H) {
      const slice = candles.slice(i, i + this.candlesPer1H);
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
    const minCandles = (this.emaSlow + 10) * this.candlesPer1H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles1H = this.resampleTo1H(candles);
    if (candles1H.length < this.emaSlow + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 1H data' };
    }

    // Calculate indicators
    const emaFast = calculateEMA(candles1H, this.emaFast);
    const emaMedium = calculateEMA(candles1H, this.emaMedium);
    const emaSlow = calculateEMA(candles1H, this.emaSlow);
    const rsi = calculateRSI(candles1H, this.rsiPeriod);
    const atr = calculateATR(candles1H, this.atrPeriod);

    const idx = candles1H.length - 1;
    const currentEMAFast = emaFast[idx];
    const currentEMAMedium = emaMedium[idx];
    const currentEMASlow = emaSlow[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const currentCandle = candles1H[idx];

    if (currentEMAFast === 0 || currentEMASlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Entry conditions
    // 1. Triple EMA stack (bullish alignment)
    const emaStack = currentEMAFast > currentEMAMedium && currentEMAMedium > currentEMASlow;

    // 2. Price above fast EMA
    const priceAboveEMA = currentPrice > currentEMAFast;

    // 3. RSI in healthy range
    const rsiOK = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. RSI rising
    const rsiRising = currentRSI > prevRSI;

    // 5. Bullish candle
    const bullishCandle = currentCandle.close > currentCandle.open;

    // ENTRY
    const hasEntry = emaStack && priceAboveEMA && rsiOK && (rsiRising || bullishCandle);

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
        reason: `HF_TREND: EMA stack | RSI ${currentRSI.toFixed(0)} | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!emaStack) reason = 'No EMA stack';
    else if (!priceAboveEMA) reason = 'Below fast EMA';
    else if (!rsiOK) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!rsiRising && !bullishCandle) reason = 'No confirmation';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
