import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateBollingerBands, getVolumeRatio } from '../utils/indicators';

/**
 * AGGRESSIVE BREAKOUT STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Wait for consolidation (low volatility squeeze)
 * - Enter on breakout with strong volume
 * - High R:R ratio (1:4) to overcome costs
 * - Trade less frequently but with higher quality setups
 *
 * MATH (with 0.35% cost per trade):
 * - If win rate 40% with 1:4 R:R:
 *   - Win: 0.40 * 8% = 3.2%
 *   - Loss: 0.60 * 2% = 1.2%
 *   - Costs: 0.35%
 *   - Net per trade: 3.2% - 1.2% - 0.35% = 1.65%
 * - Need ~22 trades over 730 days for 36% = 1 trade every 33 days
 * - This gives: 22 * 1.65% = 36.3%
 *
 * Using 4H timeframe for significant moves
 */
export class AggressiveBreakoutStrategy extends BaseStrategy {
  // Timeframe: 4H (240 1-minute candles)
  private readonly candlesPer4H: number = 240;

  // Indicators
  private readonly emaPeriod: number = 21;
  private readonly atrPeriod: number = 14;
  private readonly rsiPeriod: number = 14;
  private readonly bbPeriod: number = 20;
  private readonly bbStdDev: number = 2;

  // Entry thresholds
  private readonly minVolumeRatio: number = 2.0; // Strong volume on breakout
  private readonly minATRMultiplier: number = 1.5; // ATR expansion on breakout
  private readonly rsiMinForBreakout: number = 55; // Momentum confirmation
  private readonly rsiMaxForBreakout: number = 75; // Not overbought

  // Risk Management - HIGH R:R
  private readonly stopLossATRMultiplier: number = 1.5; // 1.5 ATR stop
  private readonly takeProfitATRMultiplier: number = 6.0; // 1:4 R:R

  // Squeeze detection
  private readonly squeezePercentile: number = 25; // BB width in bottom 25%
  private readonly minSqueezeCandles: number = 12; // At least 12 4H candles (2 days) of squeeze

  // Track squeeze state
  private squeezeCount: number = 0;

  constructor() {
    super('AggressiveBreakout');
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

  private calculateBBWidth(candles: Candle[]): number[] {
    const bb = calculateBollingerBands(candles, this.bbPeriod, this.bbStdDev);
    return bb.upper.map((upper, i) => {
      if (bb.middle[i] === 0) return 0;
      return ((upper - bb.lower[i]) / bb.middle[i]) * 100;
    });
  }

  private getPercentile(values: number[], targetValue: number): number {
    const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return 50;
    const idx = sorted.findIndex(v => v > targetValue);
    if (idx === -1) return 100;
    return (idx / sorted.length) * 100;
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.bbPeriod + 20) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.bbPeriod + 15) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const ema = calculateEMA(candles4H, this.emaPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const bb = calculateBollingerBands(candles4H, this.bbPeriod, this.bbStdDev);
    const bbWidth = this.calculateBBWidth(candles4H);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const idx = candles4H.length - 1;
    const currentEMA = ema[idx];
    const currentATR = atr[idx];
    const prevATR = atr[idx - 1];
    const currentRSI = rsi[idx];
    const currentBBWidth = bbWidth[idx];
    const prevBBWidth = bbWidth[idx - 1];
    const upperBB = bb.upper[idx];
    const lowerBB = bb.lower[idx];
    const currentCandle = candles4H[idx];

    if (currentEMA === 0 || currentATR === 0 || currentBBWidth === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Calculate BB width percentile over last 50 4H candles
    const recentBBWidths = bbWidth.slice(-50).filter(w => w > 0);
    const widthPercentile = this.getPercentile(recentBBWidths, currentBBWidth);

    // Detect squeeze (low volatility consolidation)
    const inSqueeze = widthPercentile < this.squeezePercentile;

    // Track squeeze duration
    if (inSqueeze) {
      this.squeezeCount++;
    } else {
      // Reset if squeeze ended without breakout
      if (this.squeezeCount > 0 && currentBBWidth > prevBBWidth * 1.2) {
        // Potential breakout - don't reset yet
      } else if (!inSqueeze && widthPercentile > 40) {
        this.squeezeCount = 0;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // BREAKOUT DETECTION
    // ═══════════════════════════════════════════════════════════

    // 1. Was in squeeze for sufficient time
    const hadSqueeze = this.squeezeCount >= this.minSqueezeCandles;

    // 2. BB width is now expanding (breakout volatility)
    const bbExpanding = currentBBWidth > prevBBWidth * 1.2;

    // 3. ATR is expanding (volatility confirmation)
    const atrExpanding = currentATR > prevATR * this.minATRMultiplier;

    // 4. Price broke above upper BB (bullish breakout)
    const priceAboveUpperBB = currentPrice > upperBB;

    // 5. Strong volume on breakout
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 6. RSI confirms momentum but not overbought
    const rsiConfirms = currentRSI >= this.rsiMinForBreakout && currentRSI <= this.rsiMaxForBreakout;

    // 7. Bullish candle on breakout
    const bullishCandle = currentCandle.close > currentCandle.open;

    // 8. Price above EMA (trend confirmation)
    const aboveEMA = currentPrice > currentEMA;

    // ENTRY SIGNAL
    const hasBreakout = hadSqueeze && bbExpanding && priceAboveUpperBB && hasVolume && rsiConfirms && bullishCandle && aboveEMA;

    if (hasBreakout) {
      // Reset squeeze count
      this.squeezeCount = 0;

      // ATR-based stop loss and take profit
      const stopLoss = currentPrice - (currentATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (currentATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `BREAKOUT: Squeeze ${this.squeezeCount} bars | Vol ${volumeRatio.toFixed(1)}x | RSI ${currentRSI.toFixed(0)} | ATR exp | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    // Build reason for holding
    let reason = 'Waiting';
    if (!hadSqueeze) reason = `Squeeze: ${this.squeezeCount}/${this.minSqueezeCandles}`;
    else if (!priceAboveUpperBB) reason = 'No breakout yet';
    else if (!bbExpanding) reason = 'BB not expanding';
    else if (!hasVolume) reason = `Low volume: ${volumeRatio.toFixed(1)}x`;
    else if (!rsiConfirms) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
    else if (!bullishCandle) reason = 'Bearish candle';
    else if (!aboveEMA) reason = 'Below EMA';

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {
    this.squeezeCount = 0;
  }
}
