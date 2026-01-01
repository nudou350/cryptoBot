/**
 * TrendRider Strategy
 *
 * Philosophy: BTC trends HARD - ride the trends!
 * - Enter on pullbacks in established trends
 * - Use 4H timeframe for less noise
 * - Target big moves (12%)
 * - 1:3 R:R ratio
 */

import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, getVolumeRatio } from '../utils/indicators';

export class TrendRiderStrategy extends BaseStrategy {
  private lastSignalTime: number = 0;
  private readonly COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly FOUR_HOUR_CANDLES = 60 * 4;

  // Risk Management - Ride the trend
  private readonly stopLossPercent = 4.0;
  private readonly takeProfitPercent = 12.0; // 1:3 R:R

  constructor() {
    super('TrendRider');
  }

  private resampleTo4H(candles: Candle[]): Candle[] {
    const fourHour: Candle[] = [];
    for (let i = 0; i + this.FOUR_HOUR_CANDLES <= candles.length; i += this.FOUR_HOUR_CANDLES) {
      const slice = candles.slice(i, i + this.FOUR_HOUR_CANDLES);
      fourHour.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return fourHour;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const holdSignal: TradeSignal = {
      action: 'hold',
      price: currentPrice,
      reason: 'TrendRider: Waiting for pullback in trend'
    };

    if (candles.length < this.FOUR_HOUR_CANDLES * 60) {
      return holdSignal;
    }

    const fourHour = this.resampleTo4H(candles);
    if (fourHour.length < 55) {
      return holdSignal;
    }

    // Cooldown check
    const currentTime = candles[candles.length - 1].timestamp;
    if (currentTime - this.lastSignalTime < this.COOLDOWN_MS) {
      return holdSignal;
    }

    // Calculate 4H indicators
    const ema20 = calculateEMA(fourHour, 20);
    const ema50 = calculateEMA(fourHour, 50);
    const rsi = calculateRSI(fourHour, 14);
    const volumeRatio = getVolumeRatio(fourHour, 10);

    if (ema20.length < 2 || ema50.length < 1 || rsi.length < 2) {
      return holdSignal;
    }

    const idx = fourHour.length - 1;
    const currentEma20 = ema20[idx];
    const currentEma50 = ema50[idx];
    const currentRsi = rsi[idx];
    const current4H = fourHour[idx];

    // Entry conditions
    // 1. Strong uptrend (EMA20 > EMA50)
    const uptrend = currentEma20 > currentEma50;

    // 2. Price near EMA20 zone (within 5% - more permissive)
    const nearEma20 = currentPrice >= currentEma20 * 0.95 &&
                      currentPrice <= currentEma20 * 1.05;

    // 3. RSI not overbought (room to run)
    const rsiOk = currentRsi > 40 && currentRsi < 65;

    // 4. Bullish reversal candle (close above open, wick touched EMA)
    const bullishReversal = current4H.close > current4H.open &&
                           current4H.low <= currentEma20 * 1.01;

    // 5. Volume confirmation
    const volumeOk = volumeRatio >= 0.9;

    // ENTRY: Uptrend + Near EMA + Good RSI (relaxed conditions)
    if (uptrend && nearEma20 && rsiOk && (bullishReversal || volumeOk)) {
      this.lastSignalTime = currentTime;

      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        reason: `TrendRider: Pullback to EMA20 in uptrend`,
        stopLoss,
        takeProfit
      };
    }

    return holdSignal;
  }
}
