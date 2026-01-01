import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * EXTREME MEAN REVERSION STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Only trade EXTREME oversold conditions (RSI < 25, deep BB penetration)
 * - These are high-probability bounce setups
 * - Moderate R:R (1:2.5) because win rate should be high
 * - Focus on panic sell-offs that create buying opportunities
 *
 * MATH:
 * - If win rate 55% with 1:2.5 R:R:
 *   - Win: 0.55 * 5% = 2.75%
 *   - Loss: 0.45 * 2% = 0.9%
 *   - Costs: 0.35%
 *   - Net per trade: 2.75% - 0.9% - 0.35% = 1.5%
 * - Need ~24 trades over 730 days = 1 trade every 30 days
 *
 * Uses 4H timeframe to filter noise
 */
export class ExtremeMeanReversionStrategy extends BaseStrategy {
  // Timeframe: 4H
  private readonly candlesPer4H: number = 240;

  // Indicators
  private readonly emaFast: number = 10;
  private readonly emaMedium: number = 21;
  private readonly emaSlow: number = 50;
  private readonly rsiPeriod: number = 14;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2.5; // Wider bands for extreme
  private readonly atrPeriod: number = 14;

  // EXTREME Thresholds
  private readonly rsiOversold: number = 25; // Very oversold
  private readonly bbPenetrationPercent: number = 0.5; // Price below lower BB by 0.5%
  private readonly minDropPercent: number = 5; // Min 5% drop from recent high
  private readonly lookbackPeriod: number = 20; // 20 4H candles = ~3 days

  // Volume for capitulation
  private readonly minVolumeRatio: number = 1.8;

  // Risk Management
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 5.0; // 1:2.5 R:R

  constructor() {
    super('ExtremeMeanReversion');
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

  private getRecentHigh(candles: Candle[], lookback: number): number {
    const recent = candles.slice(-lookback);
    return Math.max(...recent.map(c => c.high));
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.emaSlow + this.lookbackPeriod) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.emaSlow + this.lookbackPeriod) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const emaFast = calculateEMA(candles4H, this.emaFast);
    const emaMedium = calculateEMA(candles4H, this.emaMedium);
    const emaSlow = calculateEMA(candles4H, this.emaSlow);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const bb = calculateBollingerBands(candles4H, this.bbPeriod, this.bbStdDev);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const idx = candles4H.length - 1;
    const currentEMAFast = emaFast[idx];
    const currentEMAMedium = emaMedium[idx];
    const currentEMASlow = emaSlow[idx];
    const currentRSI = rsi[idx];
    const prevRSI = rsi[idx - 1];
    const lowerBB = bb.lower[idx];
    const middleBB = bb.middle[idx];
    const currentATR = atr[idx];
    const currentCandle = candles4H[idx];

    if (currentEMASlow === 0 || lowerBB === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Get recent high for drop calculation
    const recentHigh = this.getRecentHigh(candles4H, this.lookbackPeriod);
    const dropFromHigh = ((recentHigh - currentPrice) / recentHigh) * 100;

    // Calculate BB penetration
    const bbPenetration = ((lowerBB - currentPrice) / lowerBB) * 100;

    // ═══════════════════════════════════════════════════════════
    // EXTREME OVERSOLD CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. RSI extremely oversold
    const rsiExtreme = currentRSI <= this.rsiOversold;

    // 2. Price below lower BB (or deeply penetrating it)
    const belowLowerBB = currentPrice < lowerBB;
    const deepBBPenetration = bbPenetration >= this.bbPenetrationPercent;

    // 3. Significant drop from recent high
    const significantDrop = dropFromHigh >= this.minDropPercent;

    // 4. High volume (capitulation selling)
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 5. RSI starting to turn up (bullish divergence hint)
    const rsiTurningUp = currentRSI > prevRSI;

    // 6. Hammer or doji candle (rejection of lower prices)
    const candleBody = Math.abs(currentCandle.close - currentCandle.open);
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const candleRange = currentCandle.high - currentCandle.low;
    const hasRejection = lowerWick > candleBody * 1.5 && candleRange > 0;

    // 7. Long-term trend still intact (not in major downtrend)
    // Price shouldn't be too far below slow EMA
    const notInCrash = currentPrice > currentEMASlow * 0.85; // Within 15% of slow EMA

    // ENTRY CONDITIONS - Need multiple extreme signals
    const extremeConditions = rsiExtreme && belowLowerBB && significantDrop;
    const confirmations = hasVolume || (rsiTurningUp && hasRejection);
    const safetyCheck = notInCrash;

    const hasEntry = extremeConditions && confirmations && safetyCheck;

    if (hasEntry) {
      // ATR-based stops
      const stopLoss = currentPrice - (currentATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (currentATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `EXTREME OVERSOLD: RSI ${currentRSI.toFixed(0)} | Drop ${dropFromHigh.toFixed(1)}% | BB pen ${bbPenetration.toFixed(1)}% | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    // Build reason
    let reason = 'Waiting for extreme';
    if (!rsiExtreme) reason = `RSI ${currentRSI.toFixed(0)} not extreme (<${this.rsiOversold})`;
    else if (!belowLowerBB) reason = 'Above lower BB';
    else if (!significantDrop) reason = `Drop ${dropFromHigh.toFixed(1)}% not enough`;
    else if (!hasVolume && !rsiTurningUp) reason = `No confirmation (Vol ${volumeRatio.toFixed(1)}x)`;
    else if (!notInCrash) reason = 'In crash territory';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
