/**
 * BigTrendCatcher Strategy
 *
 * Philosophy: BTC moved from $42k to $100k (+140%) in 2 years.
 * Instead of many small trades, catch the BIG moves with:
 * - Daily timeframe signals
 * - Wide stops (8%) to avoid noise
 * - Big targets (20%) to capture major trends
 * - Very few trades (only the best setups)
 */

import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, getVolumeRatio } from '../utils/indicators';

export class BigTrendCatcherStrategy extends BaseStrategy {
  private lastSignalTime: number = 0;
  private readonly COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days (more trades)
  private readonly DAILY_CANDLES = 60 * 24;

  // Risk Management - Big targets
  private readonly stopLossPercent = 5.0; // Tighter stop
  private readonly takeProfitPercent = 15.0; // 1:3 R:R

  constructor() {
    super('BigTrendCatcher');
  }

  private resampleToDaily(candles: Candle[]): Candle[] {
    const daily: Candle[] = [];
    for (let i = 0; i + this.DAILY_CANDLES <= candles.length; i += this.DAILY_CANDLES) {
      const slice = candles.slice(i, i + this.DAILY_CANDLES);
      daily.push({
        timestamp: slice[0].timestamp,
        open: slice[0].open,
        high: Math.max(...slice.map(c => c.high)),
        low: Math.min(...slice.map(c => c.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((s, c) => s + c.volume, 0)
      });
    }
    return daily;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const holdSignal: TradeSignal = {
      action: 'hold',
      price: currentPrice,
      reason: 'BigTrendCatcher: Waiting for setup'
    };

    // Need at least 60 days of data
    if (candles.length < this.DAILY_CANDLES * 60) {
      return holdSignal;
    }

    const daily = this.resampleToDaily(candles);
    if (daily.length < 50) {
      return holdSignal;
    }

    // Cooldown check
    const currentTime = candles[candles.length - 1].timestamp;
    if (currentTime - this.lastSignalTime < this.COOLDOWN_MS) {
      return holdSignal;
    }

    // Calculate daily indicators
    const ema20 = calculateEMA(daily, 20);
    const ema50 = calculateEMA(daily, 50);
    const rsi = calculateRSI(daily, 14);

    if (ema20.length < 2 || ema50.length < 2 || rsi.length < 2) {
      return holdSignal;
    }

    const idx = daily.length - 1;
    const currentEma20 = ema20[idx];
    const currentEma50 = ema50[idx];
    const prevEma20 = ema20[idx - 1];
    const prevEma50 = ema50[idx - 1];
    const currentRsi = rsi[idx];
    const currentDaily = daily[idx];

    // Entry conditions
    // 1. Golden Cross (EMA20 crosses above EMA50)
    const goldenCross = prevEma20 <= prevEma50 && currentEma20 > currentEma50;

    // 2. Price above both EMAs
    const priceAboveEmas = currentPrice > currentEma20 && currentPrice > currentEma50;

    // 3. RSI healthy (not overbought)
    const rsiHealthy = currentRsi > 45 && currentRsi < 70;

    // 4. Bullish candle
    const bullishCandle = currentDaily.close > currentDaily.open;

    // 5. Breaking recent highs
    const recentHighs = daily.slice(-20).map(c => c.high);
    const highest20 = Math.max(...recentHighs.slice(0, -1));
    const breakingOut = currentPrice > highest20;

    // ENTRY: Golden Cross OR Breakout OR Strong Uptrend
    const strongUptrend = priceAboveEmas && bullishCandle && rsiHealthy;

    if (goldenCross ||
        (breakingOut && priceAboveEmas && rsiHealthy) ||
        (strongUptrend && currentRsi > 55)) {
      this.lastSignalTime = currentTime;

      const stopLoss = currentPrice * (1 - this.stopLossPercent / 100);
      const takeProfit = currentPrice * (1 + this.takeProfitPercent / 100);

      return {
        action: 'buy',
        price: currentPrice,
        reason: goldenCross ? 'BigTrendCatcher: Golden Cross' : 'BigTrendCatcher: Breakout',
        stopLoss,
        takeProfit
      };
    }

    return holdSignal;
  }
}
