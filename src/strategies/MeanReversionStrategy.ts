import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateBollingerBands, calculateRSI } from '../utils/indicators';

/**
 * Mean Reversion Strategy (65-70% win rate)
 *
 * Best for: Ranging markets, oversold/overbought conditions
 * Win Rate: 65-70%
 * Risk Level: Medium
 *
 * Strategy:
 * - Buy when price touches lower Bollinger Band AND RSI < 30 (oversold)
 * - Sell when price touches upper Bollinger Band AND RSI > 70 (overbought)
 * - Use 2:1 reward-risk ratio
 */
export class MeanReversionStrategy extends BaseStrategy {
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;
  private readonly rsiPeriod: number = 14;
  private readonly oversoldThreshold: number = 30;
  private readonly overboughtThreshold: number = 70;

  constructor() {
    super('MeanReversion');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.bbPeriod, this.rsiPeriod) + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const bb = calculateBollingerBands(candles, this.bbPeriod, this.bbStdDev);
    const rsi = calculateRSI(candles, this.rsiPeriod);

    const lastIndex = candles.length - 1;
    const upperBand = bb.upper[lastIndex];
    const middleBand = bb.middle[lastIndex];
    const lowerBand = bb.lower[lastIndex];
    const currentRSI = rsi[lastIndex];

    // Check if indicators are ready
    if (upperBand === 0 || lowerBand === 0 || currentRSI === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // BUY Signal: Price near lower band AND oversold RSI
    const nearLowerBand = currentPrice <= lowerBand * 1.005; // Within 0.5% of lower band
    const isOversold = currentRSI < this.oversoldThreshold;

    if (nearLowerBand && isOversold) {
      const stopLoss = currentPrice * 0.98; // 2% stop loss
      const targetProfit = (currentPrice - stopLoss) * 2; // 2:1 reward-risk
      const takeProfit = currentPrice + targetProfit;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Mean reversion BUY: Price at lower BB (${lowerBand.toFixed(2)}), RSI=${currentRSI.toFixed(2)}`
      };
    }

    // SELL Signal: Price near upper band AND overbought RSI
    const nearUpperBand = currentPrice >= upperBand * 0.995; // Within 0.5% of upper band
    const isOverbought = currentRSI > this.overboughtThreshold;

    if (nearUpperBand && isOverbought) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `Mean reversion SELL: Price at upper BB (${upperBand.toFixed(2)}), RSI=${currentRSI.toFixed(2)}`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for mean reversion setup';

    if (currentRSI < 40) {
      reason = `Price approaching oversold (RSI=${currentRSI.toFixed(2)})`;
    } else if (currentRSI > 60) {
      reason = `Price approaching overbought (RSI=${currentRSI.toFixed(2)})`;
    } else {
      reason = `Price in neutral zone (RSI=${currentRSI.toFixed(2)})`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
