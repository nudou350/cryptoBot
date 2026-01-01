import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR, calculateSMA, getVolumeRatio } from '../utils/indicators';

/**
 * OPTIMIZED Dip Buying Strategy
 *
 * TARGET: PROFITABLE with 0.35% per-trade costs
 *
 * APPROACH: Buy dips in uptrends - high win rate strategy
 * - Clear uptrend (price and EMA above SMA)
 * - Buy when price dips to support (SMA or lower EMA)
 * - Tighter risk management for higher win rate
 * - R:R of 1:2.5 with 60%+ expected win rate
 *
 * Math for Profitability:
 * With 60% win rate and 1:2.5 R:R:
 * EV = (0.60 * 2.5%) - (0.40 * 1%) - 0.35% = 1.5% - 0.4% - 0.35% = +0.75% per trade
 */
export class OptimizedDipBuyStrategy extends BaseStrategy {
  // Moving averages
  private readonly emaFast: number = 20;
  private readonly smaSlow: number = 50;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds
  private readonly rsiDipLow: number = 30; // Minimum RSI for dip
  private readonly rsiDipHigh: number = 50; // Maximum RSI (still oversold)

  // Risk Management - 1:2.5 R:R ratio (optimized for higher win rate)
  private readonly atrStopLossMultiplier: number = 1.0; // 1 ATR stop
  private readonly atrTakeProfitMultiplier: number = 2.5; // 2.5 ATR take profit

  constructor() {
    super('OptimizedDipBuy');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.smaSlow, this.atrPeriod) + 20;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const smaSlowArr = calculateSMA(candles, this.smaSlow);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const atr = calculateATR(candles, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    const idx = candles.length - 1;
    const currentEMAFast = emaFastArr[idx];
    const currentSMASlow = smaSlowArr[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const currentATR = atr[idx];
    const currentCandle = candles[idx];

    // Validate
    if (currentEMAFast === 0 || currentSMASlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Calculate distances
    const distanceFromEMA = ((currentPrice - currentEMAFast) / currentEMAFast) * 100;
    const distanceFromSMA = ((currentPrice - currentSMASlow) / currentSMASlow) * 100;

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. Uptrend structure: EMA20 > SMA50
    const isUptrend = currentEMAFast > currentSMASlow;

    // 2. Price dipped but still above SMA50 (buy the dip, not the crash)
    const aboveSMA = currentPrice > currentSMASlow;

    // 3. Price near or below EMA20 (the dip)
    const isDip = distanceFromEMA <= 0.5; // At or below EMA20

    // 4. RSI in dip zone
    const rsiInDipZone = currentRSI >= this.rsiDipLow && currentRSI <= this.rsiDipHigh;

    // 5. RSI turning up (momentum shift)
    const rsiTurningUp = currentRSI > prevRSI;

    // 6. Bullish candle (reversal)
    const isBullish = currentCandle.close > currentCandle.open;

    // 7. Decent body (not doji)
    const bodySize = Math.abs(currentCandle.close - currentCandle.open);
    const candleRange = currentCandle.high - currentCandle.low;
    const hasDecentBody = candleRange > 0 && bodySize / candleRange > 0.3;

    // 8. Volume (at least average)
    const hasVolume = volumeRatio >= 0.8;

    // ENTRY: All conditions
    const hasEntrySignal = isUptrend && aboveSMA && isDip && rsiInDipZone &&
      rsiTurningUp && isBullish && hasDecentBody && hasVolume;

    if (hasEntrySignal) {
      const stopLoss = currentPrice - (currentATR * this.atrStopLossMultiplier);
      const takeProfit = currentPrice + (currentATR * this.atrTakeProfitMultiplier);

      const risk = currentPrice - stopLoss;
      const reward = takeProfit - currentPrice;
      const rrRatio = reward / risk;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `ODip BUY: EMA dip ${distanceFromEMA.toFixed(1)}% | RSI ${currentRSI.toFixed(1)} uptick | Vol ${volumeRatio.toFixed(1)}x [R:R 1:${rrRatio.toFixed(1)}]`
      };
    }

    // HOLD with reason
    let reason = 'Waiting for dip in uptrend';
    if (!isUptrend) {
      reason = `No uptrend (EMA20 < SMA50)`;
    } else if (!aboveSMA) {
      reason = `Price below SMA50. Not a dip, it's a breakdown.`;
    } else if (!isDip) {
      reason = `Price ${distanceFromEMA.toFixed(1)}% above EMA20. Wait for dip.`;
    } else if (!rsiInDipZone) {
      if (currentRSI > this.rsiDipHigh) {
        reason = `RSI ${currentRSI.toFixed(1)} too high. Not a dip.`;
      } else {
        reason = `RSI ${currentRSI.toFixed(1)} too low. Risk of breakdown.`;
      }
    } else if (!rsiTurningUp) {
      reason = `RSI still falling. Wait for bounce.`;
    } else if (!isBullish) {
      reason = `Waiting for bullish candle`;
    } else if (!hasDecentBody) {
      reason = `Indecision candle (doji). Wait for stronger signal.`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(1)}x)`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
