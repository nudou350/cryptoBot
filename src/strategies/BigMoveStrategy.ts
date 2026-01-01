import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, calculateDI, getVolumeRatio } from '../utils/indicators';

/**
 * BIG MOVE STRATEGY
 *
 * Targets large moves using very high R:R (1:6).
 * Accepts lower win rate in exchange for bigger wins.
 *
 * Uses daily timeframe for major moves only.
 *
 * Entry conditions:
 * 1. Strong ADX (>25) indicating trend
 * 2. Bullish DI (+DI > -DI)
 * 3. Price above EMA
 * 4. RSI 50-70
 *
 * R:R = 1:6 (e.g., 2% stop, 12% target)
 *
 * Math: Even with 25% win rate:
 * 0.25 * 12% - 0.75 * 2% - 0.35% = 3% - 1.5% - 0.35% = 1.15% per trade
 */
export class BigMoveStrategy extends BaseStrategy {
  // Timeframe: Daily
  private readonly candlesPerDay: number = 1440;

  // EMAs
  private readonly emaFast: number = 10;
  private readonly emaSlow: number = 21;

  // ADX
  private readonly adxPeriod: number = 14;
  private readonly minADX: number = 25;

  // RSI
  private readonly rsiPeriod: number = 14;
  private readonly rsiMin: number = 50;
  private readonly rsiMax: number = 70;

  // ATR
  private readonly atrPeriod: number = 14;

  // Risk Management - VERY HIGH R:R
  private readonly stopLossATRMultiplier: number = 1.5;
  private readonly takeProfitATRMultiplier: number = 9.0; // 1:6 R:R

  constructor() {
    super('BigMove');
  }

  private resampleToDaily(candles: Candle[]): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + this.candlesPerDay <= candles.length; i += this.candlesPerDay) {
      const slice = candles.slice(i, i + this.candlesPerDay);
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
    const minCandles = 30 * this.candlesPerDay;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const dailyCandles = this.resampleToDaily(candles);
    if (dailyCandles.length < 25) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough daily data' };
    }

    // Calculate indicators
    const emaFast = calculateEMA(dailyCandles, this.emaFast);
    const emaSlow = calculateEMA(dailyCandles, this.emaSlow);
    const adx = calculateADX(dailyCandles, this.adxPeriod);
    const di = calculateDI(dailyCandles, this.adxPeriod);
    const rsi = calculateRSI(dailyCandles, this.rsiPeriod);
    const atr = calculateATR(dailyCandles, this.atrPeriod);

    const idx = dailyCandles.length - 1;
    const currentEMAFast = emaFast[idx];
    const currentEMASlow = emaSlow[idx];
    const currentADX = adx[idx];
    const plusDI = di.plusDI[idx];
    const minusDI = di.minusDI[idx];
    const currentRSI = rsi[idx];
    const currentATR = atr[idx];
    const currentCandle = dailyCandles[idx];

    if (currentEMAFast === 0 || currentADX === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Entry conditions
    // 1. Strong ADX
    const strongTrend = currentADX >= this.minADX;

    // 2. Bullish DI
    const bullishDI = plusDI > minusDI;

    // 3. EMA alignment
    const emaUp = currentEMAFast > currentEMASlow;

    // 4. Price above fast EMA
    const priceAboveEMA = currentPrice > currentEMAFast;

    // 5. RSI in range
    const rsiOK = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 6. Bullish daily candle
    const bullishCandle = currentCandle.close > currentCandle.open;

    // ENTRY
    const hasEntry = strongTrend && bullishDI && emaUp && priceAboveEMA && rsiOK && bullishCandle;

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
        reason: `BIG_MOVE: ADX ${currentADX.toFixed(0)} | DI+ | RSI ${currentRSI.toFixed(0)} | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    let reason = 'Waiting';
    if (!strongTrend) reason = `ADX ${currentADX.toFixed(0)} weak`;
    else if (!bullishDI) reason = 'Bearish DI';
    else if (!emaUp) reason = 'EMA down';
    else if (!priceAboveEMA) reason = 'Below EMA';
    else if (!rsiOK) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!bullishCandle) reason = 'Bearish candle';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
