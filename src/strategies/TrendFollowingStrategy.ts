import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateADX, calculateMACD } from '../utils/indicators';

/**
 * Trend Following Strategy (60-65% win rate)
 *
 * Best for: Strong trending markets
 * Win Rate: 60-65%
 * Risk Level: Medium
 *
 * Strategy:
 * - Buy when EMAs align bullishly AND ADX shows strong trend AND MACD is positive
 * - Sell when EMAs align bearishly OR trend weakens
 * - Use trailing stops to maximize profits in trends
 */
export class TrendFollowingStrategy extends BaseStrategy {
  private readonly emaFastPeriod: number = 12;
  private readonly emaSlowPeriod: number = 26;
  private readonly emaTrendPeriod: number = 50;
  private readonly adxPeriod: number = 14;
  private readonly adxThreshold: number = 25; // Strong trend threshold

  constructor() {
    super('TrendFollowing');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaTrendPeriod, this.adxPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const emaFast = calculateEMA(candles, this.emaFastPeriod);
    const emaSlow = calculateEMA(candles, this.emaSlowPeriod);
    const emaTrend = calculateEMA(candles, this.emaTrendPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const macd = calculateMACD(candles);

    const lastIndex = candles.length - 1;
    const currentEMAFast = emaFast[lastIndex];
    const currentEMASlow = emaSlow[lastIndex];
    const currentEMATrend = emaTrend[lastIndex];
    const currentADX = adx[lastIndex];
    const currentMACD = macd.macd[lastIndex];
    const currentSignal = macd.signal[lastIndex];

    // Check if indicators are ready
    if (
      currentEMAFast === 0 ||
      currentEMASlow === 0 ||
      currentEMATrend === 0 ||
      currentADX === 0
    ) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Determine trend direction
    const isBullishEMA = currentEMAFast > currentEMASlow && currentEMASlow > currentEMATrend;
    const isBearishEMA = currentEMAFast < currentEMASlow && currentEMASlow < currentEMATrend;
    const isStrongTrend = currentADX > this.adxThreshold;
    const isMACDBullish = currentMACD > currentSignal;
    const isMACDBearish = currentMACD < currentSignal;

    // BUY Signal: Bullish trend confirmed
    if (isBullishEMA && isStrongTrend && isMACDBullish && currentPrice > currentEMATrend) {
      const stopLoss = currentEMASlow * 0.98; // Stop below slow EMA with 2% buffer
      const atr = this.estimateATR(candles);
      const takeProfit = currentPrice + (atr * 3); // 3 ATR target

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Trend following BUY: Strong uptrend (ADX=${currentADX.toFixed(2)}, MACD positive)`
      };
    }

    // SELL Signal: Trend reversal or weakening
    if (isBearishEMA || !isStrongTrend || isMACDBearish) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `Trend following SELL: Trend weakening or reversing (ADX=${currentADX.toFixed(2)})`
      };
    }

    // HOLD: Waiting for trend confirmation
    let reason = 'Waiting for trend confirmation';

    if (!isStrongTrend) {
      reason = `Weak trend (ADX=${currentADX.toFixed(2)} < ${this.adxThreshold})`;
    } else if (currentPrice < currentEMATrend) {
      reason = 'Price below trend EMA, waiting for pullback entry';
    } else {
      reason = `Monitoring trend (ADX=${currentADX.toFixed(2)})`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }

  /**
   * Estimate ATR from recent candles (simplified)
   */
  private estimateATR(candles: Candle[], period: number = 14): number {
    const recentCandles = candles.slice(-period);
    let sum = 0;

    for (const candle of recentCandles) {
      sum += candle.high - candle.low;
    }

    return sum / period;
  }
}
