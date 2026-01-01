/**
 * HighWinRate Strategy
 *
 * Philosophy: Win MORE trades with small, achievable targets
 * - Target 65%+ win rate
 * - Small targets (2.5%)
 * - Tight stops (1.8%)
 * - Only trade in strong uptrends with multiple confirmations
 */

import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, getVolumeRatio } from '../utils/indicators';

export class HighWinRateStrategy extends BaseStrategy {
  private lastSignalTime: number = 0;
  private readonly COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
  private readonly HOURLY_CANDLES = 60;

  // Risk Management - Small achievable targets
  private readonly stopLossPercent = 1.8;
  private readonly takeProfitPercent = 2.5; // 1:1.4 R:R but high win rate

  constructor() {
    super('HighWinRate');
  }

  private resampleToHourly(candles: Candle[]): Candle[] {
    const hourly: Candle[] = [];
    for (let i = 0; i + this.HOURLY_CANDLES <= candles.length; i += this.HOURLY_CANDLES) {
      const slice = candles.slice(i, i + this.HOURLY_CANDLES);
      hourly.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return hourly;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const holdSignal: TradeSignal = {
      action: 'hold',
      price: currentPrice,
      reason: 'HighWinRate: Waiting for high-probability setup'
    };

    if (candles.length < this.HOURLY_CANDLES * 100) {
      return holdSignal;
    }

    const hourly = this.resampleToHourly(candles);
    if (hourly.length < 60) {
      return holdSignal;
    }

    // Cooldown check
    const currentTime = candles[candles.length - 1].timestamp;
    if (currentTime - this.lastSignalTime < this.COOLDOWN_MS) {
      return holdSignal;
    }

    // Calculate hourly indicators
    const ema8 = calculateEMA(hourly, 8);
    const ema21 = calculateEMA(hourly, 21);
    const ema50 = calculateEMA(hourly, 50);
    const rsi = calculateRSI(hourly, 14);
    const volumeRatio = getVolumeRatio(hourly, 20);

    if (ema8.length < 2 || ema21.length < 2 || ema50.length < 1 || rsi.length < 2) {
      return holdSignal;
    }

    const idx = hourly.length - 1;
    const currentEma8 = ema8[idx];
    const currentEma21 = ema21[idx];
    const currentEma50 = ema50[idx];
    const currentRsi = rsi[idx];
    const prevRsi = rsi[idx - 1];
    const currentHourly = hourly[idx];

    // Entry conditions - STRICT for high win rate
    // 1. Strong bullish EMA stack
    const bullishStack = currentEma8 > currentEma21 && currentEma21 > currentEma50;

    // 2. Price above EMA8 (in the trend)
    const priceAboveEma8 = currentPrice > currentEma8;

    // 3. RSI in momentum zone (not overbought, not oversold)
    const rsiInZone = currentRsi > 50 && currentRsi < 65;

    // 4. RSI rising (momentum confirmation)
    const rsiRising = currentRsi > prevRsi;

    // 5. Bullish candle
    const bullishCandle = currentHourly.close > currentHourly.open;

    // 6. Volume at least average
    const volumeOk = volumeRatio >= 0.8;

    // 7. Price not too far from EMA8 (avoid chasing)
    const notOverextended = currentPrice < currentEma8 * 1.015; // Within 1.5% of EMA8

    // HIGH PROBABILITY: Most conditions must be met (relaxed)
    const conditionsMet = [bullishStack, priceAboveEma8, rsiInZone, rsiRising,
                          bullishCandle, volumeOk, notOverextended].filter(Boolean).length;

    if (conditionsMet >= 5 && bullishStack && priceAboveEma8) { // At least 5 of 7
      this.lastSignalTime = currentTime;

      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        reason: `HighWinRate: Strong trend continuation (RSI: ${currentRsi.toFixed(0)})`,
        stopLoss,
        takeProfit
      };
    }

    return holdSignal;
  }
}
