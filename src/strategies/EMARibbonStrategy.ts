import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateATR, calculateAverageVolume } from '../utils/indicators';

/**
 * EMA Ribbon Strategy (58-63% win rate)
 *
 * Best for: Strong, clean trending markets with acceleration
 * Win Rate: 58-63%
 * Risk/Reward: 1:2.5-3
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
  private readonly volumeMultiplier: number = 1.5;
  private readonly ribbonExpansionThreshold: number = 0.02; // 2%
  private readonly maxOverextension: number = 3.0; // ATR multiples
  private readonly atrMultiplierTP: number = 3.0;
  private readonly atrMultiplierSL: number = 1.0;
  private readonly ribbonCompressionThreshold: number = 0.5; // 0.5%

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

    // Check bounce off EMA(8) or EMA(13)
    const bounceAtEMA8 = candles[prevIdx].low <= ema8[prevIdx] && currentPrice > ema8[idx];
    const bounceAtEMA13 = candles[prevIdx].low <= ema13[prevIdx] && currentPrice > ema13[idx];
    const validBounce = bounceAtEMA8 || bounceAtEMA13;

    // Volume check
    const volumeSurge = candles[idx].volume > avgVolume[idx] * this.volumeMultiplier;

    // Overextension check
    const overextended = (currentPrice - ema21[idx]) > (atr[idx] * this.maxOverextension);

    // BUY Signal
    if (ribbonAligned && expanding && validBounce && volumeSurge && !overextended) {
      const stopLoss = ema21[idx] - (atr[idx] * 0.2); // Just below EMA21
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      const bounceType = bounceAtEMA8 ? 'EMA8' : 'EMA13';

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `EMA Ribbon BUY: Perfect stack, expanding ribbon (${currentWidth.toFixed(2)}%), bounce at ${bounceType}, Vol=${(candles[idx].volume/avgVolume[idx]).toFixed(2)}x`
      };
    }

    // EXIT on ribbon compression
    if (currentWidth < this.ribbonCompressionThreshold) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `EMA Ribbon EXIT: Ribbon compressing (${currentWidth.toFixed(2)}%) - trend weakening`
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for EMA Ribbon setup';

    if (!ribbonAligned) {
      reason = `Ribbon not aligned (need EMA8 > EMA13 > EMA21 > EMA55)`;
    } else if (!expanding) {
      reason = `Ribbon aligned but not expanding (width: ${currentWidth.toFixed(2)}%)`;
    } else if (overextended) {
      reason = `Price overextended from EMA21 (waiting for pullback)`;
    } else if (!volumeSurge) {
      reason = `Waiting for volume surge (current: ${(candles[idx].volume/avgVolume[idx]).toFixed(2)}x)`;
    } else {
      reason = `Ribbon expanding (${currentWidth.toFixed(2)}%), waiting for bounce`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
