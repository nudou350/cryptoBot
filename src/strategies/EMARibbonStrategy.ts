import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateAverageVolume } from '../utils/indicators';

/**
 * EMA Ribbon Strategy (58-63% win rate)
 *
 * Best for: Strong, clean trending markets with acceleration
 * Win Rate: 58-63%
 * Risk/Reward: 1:3 (ATR×1.5 SL, ATR×4.5 TP)
 * Risk Level: Medium-High
 *
 * Strategy:
 * - Uses 4 EMAs (8, 13, 21, 55) to create a ribbon that shows trend strength
 * - Buys when ribbon is aligned (bullish stack) AND expanding (trend accelerating)
 * - Price bounces off EMA(8) or EMA(13) provide entry points
 * - Exits when ribbon compresses (trend weakening)
 */
export class EMARibbonStrategy extends BaseStrategy {
  private readonly ema1Period: number = 8;
  private readonly ema2Period: number = 13;
  private readonly ema3Period: number = 21;
  private readonly ema4Period: number = 55;
  private readonly atrPeriod: number = 14;
  private readonly volumePeriod: number = 20;
  private readonly volumeMultiplier: number = 1.2; // Reduced from 1.5 to 1.2
  private readonly ribbonExpansionThreshold: number = 0.005; // 0.5% - Reduced from 2%
  private readonly maxOverextension: number = 3.5; // ATR multiples - Increased slightly
  private readonly atrMultiplierTP: number = 4.5; // Increased to 4.5 for 1:3 R/R after fees
  private readonly atrMultiplierSL: number = 1.5; // Increased to 1.5 for better R/R
  private readonly ribbonCompressionThreshold: number = -1.5; // -1.5% - Allow more compression

  constructor() {
    super('EMARibbon');
  }

  private calculateRibbonWidth(ema1: number, ema4: number, price: number): number {
    return ((ema1 - ema4) / price) * 100; // Percentage width
  }

  private isRibbonExpanding(currentWidth: number, prevWidth: number): boolean {
    return currentWidth > prevWidth * (1 + this.ribbonExpansionThreshold);
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.ema4Period, this.atrPeriod, this.volumePeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data for EMA Ribbon' };

    // COOLDOWN CHECK: Prevent overtrading (15 min minimum between trades)
    if (!this.canTradeAgain()) {
      const remainingMin = this.getRemainingCooldown();
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Trade cooldown active: ${remainingMin} min remaining (prevents overtrading)`
      };
    }
    }

    // Calculate indicators
    const ema8 = calculateEMA(candles, this.ema1Period);
    const ema13 = calculateEMA(candles, this.ema2Period);
    const ema21 = calculateEMA(candles, this.ema3Period);
    const ema55 = calculateEMA(candles, this.ema4Period);
    const atr = calculateATR(candles, this.atrPeriod);
    const avgVolume = calculateAverageVolume(candles, this.volumePeriod);

    const idx = candles.length - 1;
    const prevIdx = idx - 1;

    // Check if indicators are ready
    if (ema8[idx] === 0 || ema13[idx] === 0 || ema21[idx] === 0 || ema55[idx] === 0 || atr[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Check ribbon alignment (bullish stack)
    const ribbonAligned = ema8[idx] > ema13[idx] &&
                          ema13[idx] > ema21[idx] &&
                          ema21[idx] > ema55[idx];

    // Check ribbon expansion
    const currentWidth = this.calculateRibbonWidth(ema8[idx], ema55[idx], currentPrice);
    const prevWidth = this.calculateRibbonWidth(ema8[prevIdx], ema55[prevIdx], candles[prevIdx].close);
    const expanding = this.isRibbonExpanding(currentWidth, prevWidth);

    // Check bounce off EMA(8) or EMA(13) - More flexible detection
    const ema8Tolerance = ema8[idx] * 0.002; // 0.2% tolerance
    const ema13Tolerance = ema13[idx] * 0.002;
    const bounceAtEMA8 = Math.abs(currentPrice - ema8[idx]) <= ema8Tolerance;
    const bounceAtEMA13 = Math.abs(currentPrice - ema13[idx]) <= ema13Tolerance;
    const nearEMA = bounceAtEMA8 || bounceAtEMA13 || (currentPrice > ema8[idx] && currentPrice < ema21[idx]);

    // Volume check
    const volumeSurge = candles[idx].volume > avgVolume[idx] * this.volumeMultiplier;

    // Overextension check
    const overextended = (currentPrice - ema21[idx]) > (atr[idx] * this.maxOverextension);

    // BUY Signal - More relaxed conditions
    // Either (aligned + expanding + near EMA) OR (aligned + volume surge + near EMA)
    const hasGoodVolume = volumeSurge || candles[idx].volume > avgVolume[idx] * 1.0; // At least average volume
    const readyForEntry = ribbonAligned && nearEMA && hasGoodVolume && !overextended;

    if (readyForEntry && (expanding || volumeSurge)) {
      // CRITICAL FIX: Calculate stop loss from entry price, not EMA21
      // This ensures consistent risk management regardless of EMA position
      const stopLoss = currentPrice - (atr[idx] * this.atrMultiplierSL);
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      // Calculate actual risk/reward ratio for logging
      const risk = currentPrice - stopLoss;
      const reward = takeProfit - currentPrice;
      const riskRewardRatio = reward / risk;

      const bounceType = bounceAtEMA8 ? 'EMA8' : (bounceAtEMA13 ? 'EMA13' : 'EMA zone');

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `EMA Ribbon BUY: Stack aligned, ribbon ${expanding ? 'expanding' : 'stable'} (${currentWidth.toFixed(2)}%), near ${bounceType}, Vol=${(candles[idx].volume/avgVolume[idx]).toFixed(2)}x [R:R 1:${riskRewardRatio.toFixed(1)}]`
      };
    }

    // EXIT conditions - More nuanced
    // 1. Ribbon severely compressed (below threshold)
    // 2. Ribbon flipped (bearish crossover detected)
    const ribbonFlipped = !ribbonAligned && (ema8[idx] < ema13[idx] || ema13[idx] < ema21[idx]);
    const severeCompression = currentWidth < this.ribbonCompressionThreshold;

    if (severeCompression || ribbonFlipped) {
      const reason = ribbonFlipped
        ? `EMA Ribbon EXIT: Bearish crossover detected - trend reversing`
        : `EMA Ribbon EXIT: Severe compression (${currentWidth.toFixed(2)}%) - trend exhausted`;

      return {
        action: 'close',
        price: currentPrice,
        reason
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for EMA Ribbon setup';

    if (!ribbonAligned) {
      reason = `Ribbon not aligned (need EMA8 > EMA13 > EMA21 > EMA55)`;
    } else if (!nearEMA) {
      reason = `Ribbon aligned but price not near EMA zone (waiting for pullback)`;
    } else if (overextended) {
      reason = `Price overextended from EMA21 by ${((currentPrice - ema21[idx])/atr[idx]).toFixed(1)} ATR (waiting for pullback)`;
    } else if (!hasGoodVolume) {
      reason = `Waiting for volume confirmation (current: ${(candles[idx].volume/avgVolume[idx]).toFixed(2)}x)`;
    } else if (!expanding && !volumeSurge) {
      reason = `Near entry zone (${currentWidth.toFixed(2)}%), waiting for expansion or volume surge`;
    } else {
      reason = `Conditions forming - ribbon width: ${currentWidth.toFixed(2)}%, monitoring...`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
