import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateRSI, calculateADX, calculateDI, getVolumeRatio } from '../utils/indicators';

/**
 * SUPERTREND STRATEGY
 *
 * Goal: 0.1% daily profit = 36% annually
 *
 * APPROACH:
 * - Implements the SuperTrend indicator for trend following
 * - Only trades when trend is VERY clear (multiple confirmations)
 * - Uses pyramid entries (add to winners) mentally modeled
 * - Ultra high R:R (1:5) because we're catching major moves
 *
 * SUPERTREND FORMULA:
 * - Upper Band = (High + Low) / 2 + Multiplier * ATR
 * - Lower Band = (High + Low) / 2 - Multiplier * ATR
 * - SuperTrend = Uptrend when price closes above Upper Band
 *
 * MATH:
 * - If win rate 35% with 1:5 R:R:
 *   - Win: 0.35 * 10% = 3.5%
 *   - Loss: 0.65 * 2% = 1.3%
 *   - Costs: 0.35%
 *   - Net per trade: 3.5% - 1.3% - 0.35% = 1.85%
 * - Need ~20 trades over 730 days = 1 trade every 36 days
 */
export class SuperTrendStrategy extends BaseStrategy {
  // Timeframe: Daily for major trends
  private readonly candlesPerDay: number = 1440;
  private readonly candlesPer4H: number = 240;

  // SuperTrend parameters
  private readonly atrPeriod: number = 10;
  private readonly multiplier: number = 3.0;

  // Additional indicators
  private readonly emaFast: number = 10;
  private readonly emaSlow: number = 21;
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;

  // Thresholds
  private readonly minADX: number = 25; // Strong trend
  private readonly rsiMin: number = 45;
  private readonly rsiMax: number = 70;
  private readonly minVolumeRatio: number = 1.2;

  // Risk Management - ULTRA HIGH R:R
  private readonly stopLossATRMultiplier: number = 2.0;
  private readonly takeProfitATRMultiplier: number = 10.0; // 1:5 R:R

  // State
  private lastSuperTrend: number = 0;
  private trendDirection: 'up' | 'down' | 'none' = 'none';

  constructor() {
    super('SuperTrend');
  }

  private resampleToTimeframe(candles: Candle[], candlesPerPeriod: number): Candle[] {
    const resampled: Candle[] = [];
    for (let i = 0; i + candlesPerPeriod <= candles.length; i += candlesPerPeriod) {
      const slice = candles.slice(i, i + candlesPerPeriod);
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

  private calculateSuperTrend(candles: Candle[]): {
    superTrend: number[],
    direction: ('up' | 'down')[],
    upperBand: number[],
    lowerBand: number[]
  } {
    const atr = calculateATR(candles, this.atrPeriod);
    const superTrend: number[] = [];
    const direction: ('up' | 'down')[] = [];
    const upperBand: number[] = [];
    const lowerBand: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      if (i < this.atrPeriod || atr[i] === 0) {
        superTrend.push(0);
        direction.push('up');
        upperBand.push(0);
        lowerBand.push(0);
        continue;
      }

      const hl2 = (candles[i].high + candles[i].low) / 2;
      const upper = hl2 + (this.multiplier * atr[i]);
      const lower = hl2 - (this.multiplier * atr[i]);

      upperBand.push(upper);
      lowerBand.push(lower);

      // Determine trend direction
      if (i === this.atrPeriod) {
        // First calculation
        if (candles[i].close > upper) {
          superTrend.push(lower);
          direction.push('up');
        } else {
          superTrend.push(upper);
          direction.push('down');
        }
      } else {
        const prevST = superTrend[i - 1];
        const prevDir = direction[i - 1];

        if (prevDir === 'up') {
          // In uptrend
          if (candles[i].close < prevST) {
            // Trend reversal to down
            superTrend.push(upper);
            direction.push('down');
          } else {
            // Continue uptrend - use higher of current lower and previous ST
            superTrend.push(Math.max(lower, prevST));
            direction.push('up');
          }
        } else {
          // In downtrend
          if (candles[i].close > prevST) {
            // Trend reversal to up
            superTrend.push(lower);
            direction.push('up');
          } else {
            // Continue downtrend - use lower of current upper and previous ST
            superTrend.push(Math.min(upper, prevST));
            direction.push('down');
          }
        }
      }
    }

    return { superTrend, direction, upperBand, lowerBand };
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const minCandles = 45 * this.candlesPerDay;
    if (candles.length < minCandles) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Use daily for SuperTrend, 4H for entry timing
    const dailyCandles = this.resampleToTimeframe(candles, this.candlesPerDay);
    const candles4H = this.resampleToTimeframe(candles, this.candlesPer4H);

    if (dailyCandles.length < 30 || candles4H.length < 30) {
      return { action: 'hold', price: currentPrice, reason: 'Not enough resampled data' };
    }

    // Calculate SuperTrend on daily
    const st = this.calculateSuperTrend(dailyCandles);
    const idxDaily = dailyCandles.length - 1;
    const currentST = st.superTrend[idxDaily];
    const prevST = st.superTrend[idxDaily - 1];
    const currentDir = st.direction[idxDaily];
    const prevDir = st.direction[idxDaily - 1];

    if (currentST === 0) {
      return { action: 'hold', price: currentPrice, reason: 'SuperTrend not ready' };
    }

    // Calculate other daily indicators
    const adxDaily = calculateADX(dailyCandles, this.adxPeriod);
    const diDaily = calculateDI(dailyCandles, this.adxPeriod);
    const currentADX = adxDaily[idxDaily];
    const plusDI = diDaily.plusDI[idxDaily];
    const minusDI = diDaily.minusDI[idxDaily];

    // 4H indicators for entry timing
    const idx4H = candles4H.length - 1;
    const ema4HFast = calculateEMA(candles4H, this.emaFast);
    const ema4HSlow = calculateEMA(candles4H, this.emaSlow);
    const rsi4H = calculateRSI(candles4H, this.rsiPeriod);
    const atr4H = calculateATR(candles4H, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles4H, 10);

    const h4EMAFast = ema4HFast[idx4H];
    const h4EMASlow = ema4HSlow[idx4H];
    const h4RSI = rsi4H[idx4H];
    const prevRSI = rsi4H[idx4H - 1];
    const h4ATR = atr4H[idx4H];
    const h4Candle = candles4H[idx4H];

    // ═══════════════════════════════════════════════════════════
    // ENTRY CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. SuperTrend just flipped to uptrend (fresh signal)
    const superTrendFlipped = currentDir === 'up' && prevDir === 'down';

    // 2. Or SuperTrend is up and we're in a pullback
    const inUptrend = currentDir === 'up';
    const priceAboveST = currentPrice > currentST;

    // 3. Strong ADX confirms trend
    const strongTrend = currentADX >= this.minADX;

    // 4. DI confirms bullish
    const bullishDI = plusDI > minusDI;

    // 5. 4H EMA alignment
    const h4EMAsAligned = h4EMAFast > h4EMASlow;

    // 6. RSI healthy
    const rsiHealthy = h4RSI >= this.rsiMin && h4RSI <= this.rsiMax;
    const rsiRising = h4RSI > prevRSI;

    // 7. Volume
    const hasVolume = volumeRatio >= this.minVolumeRatio;

    // 8. Bullish 4H candle
    const bullishCandle = h4Candle.close > h4Candle.open;

    // FRESH SIGNAL ENTRY (just flipped)
    const freshEntry = superTrendFlipped && strongTrend && bullishDI && h4EMAsAligned && rsiHealthy;

    // PULLBACK ENTRY (in established uptrend)
    const pullbackEntry = inUptrend && priceAboveST && strongTrend && bullishDI &&
                          h4EMAsAligned && rsiHealthy && rsiRising && hasVolume && bullishCandle;

    const hasEntry = freshEntry || pullbackEntry;

    if (hasEntry) {
      // Use 4H ATR for stops
      const stopLoss = currentPrice - (h4ATR * this.stopLossATRMultiplier);
      const takeProfit = currentPrice + (h4ATR * this.takeProfitATRMultiplier);

      const slPercent = ((currentPrice - stopLoss) / currentPrice * 100).toFixed(1);
      const tpPercent = ((takeProfit - currentPrice) / currentPrice * 100).toFixed(1);

      const entryType = freshEntry ? 'FRESH FLIP' : 'PULLBACK';

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `SUPERTREND ${entryType}: ADX ${currentADX.toFixed(0)} | DI+ | RSI ${h4RSI.toFixed(0)} | Vol ${volumeRatio.toFixed(1)}x | SL -${slPercent}% TP +${tpPercent}%`
      };
    }

    // Build reason
    let reason = 'Waiting';
    if (currentDir === 'down') reason = 'SuperTrend DOWN';
    else if (!priceAboveST) reason = 'Price below SuperTrend';
    else if (!strongTrend) reason = `ADX ${currentADX.toFixed(0)} weak`;
    else if (!bullishDI) reason = 'DI bearish';
    else if (!h4EMAsAligned) reason = '4H EMAs not aligned';
    else if (!rsiHealthy) reason = `RSI ${h4RSI.toFixed(0)} out of range`;
    else if (!hasVolume && !freshEntry) reason = `Low volume ${volumeRatio.toFixed(1)}x`;

    return { action: 'hold', price: currentPrice, reason };
  }

  public reset(): void {
    this.lastSuperTrend = 0;
    this.trendDirection = 'none';
  }
}
