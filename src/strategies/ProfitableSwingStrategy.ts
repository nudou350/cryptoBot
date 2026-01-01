import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateATR, calculateADX, getVolumeRatio } from '../utils/indicators';

/**
 * PROFITABLE Swing Trading Strategy
 *
 * DESIGNED TO BE PROFITABLE with 0.35% per-trade costs
 *
 * Key Design Principles:
 * 1. VERY HIGH R:R Ratio (1:8) - Swing for big moves
 * 2. Multi-Day Holds - Ride the trend, fewer trades
 * 3. Strong Trend Filter - Only trade in clear trends
 * 4. Deep Pullback Entry - Wait for significant retracements
 *
 * Target: 35%+ win rate with 1:8 R:R = PROFITABLE
 *
 * Math: (0.35 * 8%) - (0.65 * 1%) - 0.35% = 2.8% - 0.65% - 0.35% = +1.8% per trade
 *
 * This is a PATIENT strategy - few trades, big winners
 */
export class ProfitableSwingStrategy extends BaseStrategy {
  // EMA periods
  private readonly emaFast: number = 21;
  private readonly emaMedium: number = 50;
  private readonly emaSlow: number = 100;

  // Other indicators
  private readonly rsiPeriod: number = 14;
  private readonly adxPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // Entry thresholds - VERY STRICT
  private readonly adxMinThreshold: number = 30; // Strong trend required
  private readonly rsiPullbackLow: number = 30; // Deep pullback
  private readonly rsiPullbackHigh: number = 50; // But not overbought
  private readonly volumeMinMultiplier: number = 1.5;

  // Risk Management - 1:8 R:R ratio (swing trades need room)
  private readonly atrStopLossMultiplier: number = 2.0; // 2 ATR stop (wide)
  private readonly atrTakeProfitMultiplier: number = 16.0; // 16 ATR take profit (1:8)

  // Pullback requirements
  private readonly minPullbackPercent: number = 2.0; // Must pull back at least 2%
  private readonly maxPullbackPercent: number = 8.0; // But not more than 8%

  // Minimum volatility
  private readonly minATRPercent: number = 0.5;

  constructor() {
    super('ProfitableSwing');
  }

  private calculateSwingHigh(candles: Candle[], period: number): number {
    const slice = candles.slice(-period);
    return Math.max(...slice.map(c => c.high));
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.emaSlow, this.adxPeriod, this.atrPeriod) + 30;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    // Calculate all indicators
    const emaFastArr = calculateEMA(candles, this.emaFast);
    const emaMediumArr = calculateEMA(candles, this.emaMedium);
    const emaSlowArr = calculateEMA(candles, this.emaSlow);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const adx = calculateADX(candles, this.adxPeriod);
    const atr = calculateATR(candles, this.atrPeriod);
    const volumeRatio = getVolumeRatio(candles, 20);

    // Get latest values
    const idx = candles.length - 1;
    const currentEMAFast = emaFastArr[idx];
    const currentEMAMedium = emaMediumArr[idx];
    const currentEMASlow = emaSlowArr[idx];
    const currentRSI = rsi[idx];
    const currentADX = adx[idx];
    const currentATR = atr[idx];
    const currentCandle = candles[idx];

    // Previous values for momentum check
    const prevRSI = rsi[idx - 1];

    // Recent swing high
    const recentSwingHigh = this.calculateSwingHigh(candles, 20);

    // Validate indicators
    if (currentEMAFast === 0 || currentEMAMedium === 0 || currentEMASlow === 0 || currentATR === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Calculate ATR as percentage
    const atrPercent = (currentATR / currentPrice) * 100;

    // ═══════════════════════════════════════════════════════════
    // SWING TRADE CONDITIONS
    // ═══════════════════════════════════════════════════════════

    // 1. STRONG UPTREND: All EMAs aligned
    const bullishAlignment = currentEMAFast > currentEMAMedium && currentEMAMedium > currentEMASlow;

    // 2. STRONG TREND STRENGTH: ADX > 30
    const strongTrend = currentADX >= this.adxMinThreshold;

    // 3. DEEP PULLBACK: Price pulled back significantly from swing high
    const pullbackFromHigh = ((recentSwingHigh - currentPrice) / recentSwingHigh) * 100;
    const hasDeepPullback = pullbackFromHigh >= this.minPullbackPercent && pullbackFromHigh <= this.maxPullbackPercent;

    // 4. RSI RESET: RSI pulled back to oversold territory
    const rsiReset = currentRSI >= this.rsiPullbackLow && currentRSI <= this.rsiPullbackHigh;

    // 5. RSI TURNING UP: Momentum shifting
    const rsiTurningUp = currentRSI > prevRSI;

    // 6. PRICE AT SUPPORT: Near EMA50 (dynamic support)
    const distanceFromEMA50 = ((currentPrice - currentEMAMedium) / currentEMAMedium) * 100;
    const nearSupport = distanceFromEMA50 >= -3 && distanceFromEMA50 <= 5;

    // 7. ABOVE EMA100: Still in long-term uptrend
    const aboveEMA100 = currentPrice > currentEMASlow;

    // 8. BULLISH CANDLE: Current candle is bullish
    const isBullishCandle = currentCandle.close > currentCandle.open;

    // 9. VOLUME: Confirmation
    const hasVolume = volumeRatio >= this.volumeMinMultiplier;

    // 10. VOLATILITY: Need room for the swing
    const hasVolatility = atrPercent >= this.minATRPercent;

    // ═══════════════════════════════════════════════════════════
    // ENTRY SIGNAL
    // ═══════════════════════════════════════════════════════════

    const hasTrendStructure = bullishAlignment && strongTrend && aboveEMA100;
    const hasPullbackSetup = hasDeepPullback && rsiReset && rsiTurningUp && nearSupport;
    const hasConfirmation = isBullishCandle && hasVolume && hasVolatility;

    const hasEntrySignal = hasTrendStructure && hasPullbackSetup && hasConfirmation;

    if (hasEntrySignal) {
      // ATR-based dynamic stops for 1:8 R:R
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
        reason: `PSwing BUY: Deep pullback -${pullbackFromHigh.toFixed(1)}% | ADX ${currentADX.toFixed(1)} | RSI ${currentRSI.toFixed(1)} | Vol ${volumeRatio.toFixed(1)}x [R:R 1:${rrRatio.toFixed(1)}]`
      };
    }

    // ═══════════════════════════════════════════════════════════
    // HOLD: Detailed reason
    // ═══════════════════════════════════════════════════════════

    let reason = 'Waiting for deep pullback in strong trend';

    if (!bullishAlignment) {
      reason = `No bullish EMA alignment (need EMA21 > EMA50 > EMA100)`;
    } else if (!strongTrend) {
      reason = `Weak trend (ADX ${currentADX.toFixed(1)} < ${this.adxMinThreshold}). Need strong trend.`;
    } else if (!aboveEMA100) {
      reason = `Price below EMA100. Long-term trend weak.`;
    } else if (!hasDeepPullback) {
      if (pullbackFromHigh < this.minPullbackPercent) {
        reason = `Pullback too shallow (${pullbackFromHigh.toFixed(1)}%, need ${this.minPullbackPercent}%+)`;
      } else {
        reason = `Pullback too deep (${pullbackFromHigh.toFixed(1)}%, max ${this.maxPullbackPercent}%)`;
      }
    } else if (!rsiReset) {
      if (currentRSI > this.rsiPullbackHigh) {
        reason = `RSI ${currentRSI.toFixed(1)} not reset. Wait for deeper pullback.`;
      } else {
        reason = `RSI ${currentRSI.toFixed(1)} too low. Wait for stabilization.`;
      }
    } else if (!rsiTurningUp) {
      reason = `RSI still falling. Wait for momentum shift.`;
    } else if (!nearSupport) {
      reason = `Not near EMA50 support (${distanceFromEMA50.toFixed(1)}%)`;
    } else if (!isBullishCandle) {
      reason = `Waiting for bullish candle to confirm bounce`;
    } else if (!hasVolume) {
      reason = `Low volume (${volumeRatio.toFixed(2)}x, need ${this.volumeMinMultiplier}x)`;
    } else if (!hasVolatility) {
      reason = `Low ATR (${atrPercent.toFixed(2)}%, need ${this.minATRPercent}%+)`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }

  public reset(): void {
    // Stateless strategy
  }
}
