import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateMACD, getVolumeRatio } from '../utils/indicators';

/**
 * MACD DIVERGENCE STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Detect bullish divergence: Price makes lower low, MACD makes higher low
 * - This is a powerful reversal signal that often precedes significant moves
 * - Very high R:R (1:4) because divergence setups are high-conviction
 * - Focus on quality over quantity
 *
 * MATH:
 * - If win rate 40% with 1:4 R:R:
 *   - Win: 0.40 * 8% = 3.2%
 *   - Loss: 0.60 * 2% = 1.2%
 *   - Costs: 0.35%
 *   - Net per trade: 3.2% - 1.2% - 0.35% = 1.65%
 * - Need ~22 trades over 730 days = 1 trade every 33 days
 *
 * Uses 4H timeframe for significant divergences
 */
export class MACDDivergenceStrategy extends BaseStrategy {
  // Timeframe: 4H
  private readonly candlesPer4H: number = 240;

  // MACD parameters
  private readonly macdFast: number = 12;
  private readonly macdSlow: number = 26;
  private readonly macdSignal: number = 9;

  // Other indicators
  private readonly emaPeriod: number = 50;
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Divergence detection
  private readonly divergenceLookback: number = 20; // Look back 20 4H candles for divergence
  private readonly minPriceDrop: number = 2; // Min 2% drop for lower low
  private readonly minMACDRise: number = 0.1; // Min MACD rise (relative)

  // Thresholds
  private readonly rsiMin: number = 30;
  private readonly rsiMax: number = 50;
  private readonly minVolumeRatio: number = 1.3;

  // Risk Management
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 8.0; // 1:4 R:R

  constructor() {
    super('MACDDivergence');
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

  private findLocalMinima(values: number[], lookback: number): { index: number, value: number }[] {
    const minima: { index: number, value: number }[] = [];

    for (let i = 2; i < values.length - 1; i++) {
      // Check if this is a local minimum
      if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
        // Also check 2 candles back if possible
        if (i >= 2 && values[i] < values[i - 2]) {
          minima.push({ index: i, value: values[i] });
        }
      }
    }

    // Return last 'lookback' minima
    return minima.slice(-lookback);
  }

  private detectBullishDivergence(
    priceLows: number[],
    macdValues: number[],
    lookback: number
  ): { found: boolean, strength: number } {
    // Find local minima in price
    const priceMinima = this.findLocalMinima(priceLows, 5);

    // Find local minima in MACD
    const macdMinima = this.findLocalMinima(macdValues, 5);

    if (priceMinima.length < 2 || macdMinima.length < 2) {
      return { found: false, strength: 0 };
    }

    // Get the two most recent minima
    const recentPriceMin = priceMinima[priceMinima.length - 1];
    const prevPriceMin = priceMinima[priceMinima.length - 2];

    const recentMACDMin = macdMinima[macdMinima.length - 1];
    const prevMACDMin = macdMinima[macdMinima.length - 2];

    // Check for bullish divergence:
    // Price makes LOWER low, MACD makes HIGHER low
    const priceLowerLow = recentPriceMin.value < prevPriceMin.value;
    const macdHigherLow = recentMACDMin.value > prevMACDMin.value;

    // Calculate strength of divergence
    const priceDrop = ((prevPriceMin.value - recentPriceMin.value) / prevPriceMin.value) * 100;
    const macdRise = Math.abs(recentMACDMin.value - prevMACDMin.value);

    const found = priceLowerLow && macdHigherLow &&
                  priceDrop >= this.minPriceDrop;

    return { found, strength: priceDrop };
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = (this.macdSlow + this.divergenceLookback + 10) * this.candlesPer4H;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const candles4H = this.resampleTo4H(candles);
    if (candles4H.length < this.macdSlow + this.divergenceLookback + 5) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough 4H data' };
    }

    // Calculate indicators
    const macd = calculateMACD(candles4H, this.macdFast, this.macdSlow, this.macdSignal);
    const ema = calculateEMA(candles4H, this.emaPeriod);
    const rsi = calculateRSI(candles4H, this.rsiPeriod);
    const atr = calculateATR(candles4H, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const idx = candles4H.length - 1;
    const currentMACD = macd.macd[idx];
    const currentSignal = macd.signal[idx];
    const currentHistogram = macd.histogram[idx];
    const prevHistogram = macd.histogram[idx - 1];
    const currentEMA = ema[idx];
    const currentRSI = rsi[idx];
    const currentATR = atr[idx];
    const currentCandle = candles4H[idx];

    if (currentEMA === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Get price lows and MACD values for divergence detection
    const lookbackCandles = candles4H.slice(-this.divergenceLookback);
    const priceLows = lookbackCandles.map(c => c.low);
    const macdValues = macd.macd.slice(-this.divergenceLookback);

    // Detect bullish divergence
    const divergence = this.detectBullishDivergence(priceLows, macdValues, this.divergenceLookback);

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. Bullish divergence detected
    const hasDivergence = divergence.found;

    // 2. MACD histogram turning positive (or becoming less negative)
    const histogramImproving = currentHistogram > prevHistogram;

    // 3. MACD crossing above signal (or about to)
    const macdCrossing = currentMACD > currentSignal || (currentMACD > prevHistogram && histogramImproving);

    // 4. RSI in oversold/recovering range
    const rsiRecovering = currentRSI >= this.rsiMin && currentRSI <= this.rsiMax;

    // 5. Price not too far below EMA (not in crash)
    const notInCrash = currentPrice > currentEMA * 0.9;

    // 6. Volume confirmation
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 7. Current candle showing strength (bullish or hammer)
    const candleBody = currentCandle.close - currentCandle.open;
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const bullishCandle = candleBody > 0;
    const hammerCandle = lowerWick > Math.abs(candleBody) * 1.5;
    const showsStrength = bullishCandle || hammerCandle;

    // ENTRY
    const hasEntry = hasDivergence && histogramImproving && rsiRecovering &&
                     notInCrash && (hasVolume || showsStrength);

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
        reason: `DIVERGENCE: Strength ${divergence.strength.toFixed(1)}% | RSI ${currentRSI.toFixed(0)} | MACD+ | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    // Build reason
    let reason = 'Waiting for divergence';
    if (hasDivergence) {
      if (!histogramImproving) reason = 'Divergence but MACD falling';
      else if (!rsiRecovering) reason = `RSI ${currentRSI.toFixed(0)} out of range`;
      else if (!notInCrash) reason = 'In crash territory';
      else if (!hasVolume && !showsStrength) reason = 'No confirmation';
    }

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {}
}
