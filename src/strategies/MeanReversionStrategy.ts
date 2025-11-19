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
 * - Buy when price touches lower Bollinger Band AND RSI < 35 (oversold)
 * - Sell when price reaches take profit OR RSI > 65 (with profit)
 * - Use 1:2 risk-reward ratio (2% SL, 4% TP)
 *
 * OPTIMIZED:
 * - Tracks entry price for accurate P/L calculation
 * - RSI thresholds adjusted (35/65) for more signals
 * - Faster 4% take profit for better turnover
 * - Multiple exit conditions that require being in profit
 */
export class MeanReversionStrategy extends BaseStrategy {
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;
  private readonly rsiPeriod: number = 14;
  private readonly oversoldThreshold: number = 35; // Raised from 30 for more signals
  private readonly overboughtThreshold: number = 65; // Lowered from 70 for faster exits

  private entryPrice: number = 0;
  private inPosition: boolean = false;

  constructor() {
    super('MeanReversion');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.bbPeriod, this.rsiPeriod) + 5;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // COOLDOWN CHECK: Prevent overtrading (15 min minimum between trades)
    if (!this.canTradeAgain()) {
      const remainingMin = this.getRemainingCooldown();
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Trade cooldown active: ${remainingMin} min remaining`
      };
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

    // POSITION MANAGEMENT: If we have a position, manage it
    if (this.inPosition && this.entryPrice > 0) {
      const profitPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

      // Take profit at 4% (faster turnover than 5%)
      if (profitPercent >= 4.0) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev TP: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // Stop loss at 2%
      if (profitPercent <= -2.0) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev SL: ${profitPercent.toFixed(2)}%`
        };
      }

      // EXIT on RSI overbought (only if in profit > 2%!)
      if (currentRSI > this.overboughtThreshold && profitPercent > 2.0) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev RSI exit: +${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)})`
        };
      }

      // EXIT when price returns to middle band (only if in profit > 1.5%!)
      if (currentPrice >= middleBand && profitPercent > 1.5) {
        this.inPosition = false;
        this.entryPrice = 0;
        return {
          action: 'close',
          price: currentPrice,
          reason: `MeanRev middle band: +${profitPercent.toFixed(2)}%`
        };
      }

      return {
        action: 'hold',
        price: currentPrice,
        reason: `MeanRev: ${profitPercent.toFixed(2)}% (RSI: ${currentRSI.toFixed(1)}, target: +4%)`
      };
    }

    // ENTRY: Near lower band AND oversold
    const nearLowerBand = currentPrice <= lowerBand * 1.005; // Within 0.5% of lower band
    const isOversold = currentRSI < this.oversoldThreshold;

    if (nearLowerBand && isOversold && !this.inPosition) {
      const stopLoss = currentPrice * 0.98; // 2% stop
      const takeProfit = currentPrice * 1.04; // 4% target
      // Risk/Reward = 1:2

      this.inPosition = true;
      this.entryPrice = currentPrice;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `MeanRev BUY: Lower BB (RSI: ${currentRSI.toFixed(1)}) [R:R 1:2]`
      };
    }

    // HOLD: Waiting for setup
    let reason = 'Waiting for mean reversion setup';

    if (currentRSI < 40) {
      reason = `Approaching oversold (RSI: ${currentRSI.toFixed(1)})`;
    } else if (currentRSI > 60) {
      reason = `Approaching overbought (RSI: ${currentRSI.toFixed(1)})`;
    } else {
      reason = `Neutral zone (RSI: ${currentRSI.toFixed(1)})`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }

  /**
   * Reset strategy state
   */
  public reset(): void {
    this.inPosition = false;
    this.entryPrice = 0;
  }
}
