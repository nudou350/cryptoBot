import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, getVolumeRatio } from '../utils/indicators';

/**
 * SIMPLE TREND STRATEGY
 *
 * Very simple trend-following strategy with minimal conditions.
 * Uses 4H timeframe.
 *
 * Entry conditions:
 * 1. EMA fast > EMA slow (uptrend)
 * 2. Price above EMA fast
 * 3. RSI 40-65 (not overbought, room to run)
 *
 * Uses 1:2.5 R:R
 */
export class SimpleTrendStrategy extends BaseStrategy {
  // Timeframe: 4H
  private readonly candlesPer4H: number = 240;

  // EMAs
  private readonly emaFast: number = 10;
  private readonly emaSlow: number = 30;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds
  private readonly rsiMin: number = 40;
  private readonly rsiMax: number = 65;

  // Risk Management
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 5.0; // 1:2.5 R:R

  constructor() {
    super('SimpleTrend');
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
    const minCandles = (this.emaSlow + 10) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.emaSlow + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const emaFast = calculateEMA(candles4H, this.emaFast);
    const emaSlow = calculateEMA(candles4H, this.emaSlow);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);

    const idx = candles4H.length - 1;
    const currentEMAFast = emaFast[idx];
    const currentEMASlow = emaSlow[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const currentCandle = candles4H[idx];

    if (currentEMAFast === 0 || currentEMASlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Entry conditions
    // 1. Uptrend (EMA alignment)
    const uptrend = currentEMAFast > currentEMASlow;

    // 2. Price above fast EMA
    const priceAboveEMA = currentPrice > currentEMAFast;

    // 3. RSI in range
    const rsiOK = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 4. Bullish candle
    const bullishCandle = currentCandle.close > currentCandle.open;

    // ENTRY
    const hasEntry = uptrend && priceAboveEMA && rsiOK && bullishCandle;

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
        reason: `TREND: EMA up | Price > EMA | RSI ${currentRSI.toFixed(0)} | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!uptrend) reason = 'No uptrend';
    else if (!priceAboveEMA) reason = 'Below EMA';
    else if (!rsiOK) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!bullishCandle) reason = 'Bearish candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
