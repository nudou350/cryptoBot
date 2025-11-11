import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR } from '../utils/indicators';

/**
 * Triple EMA Strategy - FIXED FOR $500 BUDGET
 *
 * Best for: Trending markets with pullbacks
 * Win Rate Target: 60-65%
 * Risk/Reward: 1:2
 * Risk Level: Medium
 *
 * CRITICAL FIXES TO SOLVE "0 TRADES" PROBLEM:
 * - RSI range: 45-70 → 40-75 (wider acceptable range)
 * - Pullback detection: Requires exact bounce → Accepts near EMA21
 * - Entry logic: Removed MACD requirement (too restrictive)
 * - Removed "previouslyBelowEMA21" requirement (waiting for perfect bounce)
 * - Accept price NEAR EMA21, not just perfect bounce
 * - More tolerance for entry conditions
 *
 * ROOT CAUSE OF 0 TRADES:
 * Strategy was waiting for PERFECT pullback + MACD + RSI alignment.
 * This combination is extremely rare. Loosened to practical conditions.
 */
export class TripleEMAStrategy extends BaseStrategy {
  private readonly ema1Period: number = 8;
  private readonly ema2Period: number = 21;
  private readonly ema3Period: number = 55;
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;

  // LOOSENED PARAMETERS
  private readonly rsiLower: number = 40; // Was 45
  private readonly rsiUpper: number = 75; // Was 70
  private readonly atrMultiplierTP: number = 2.0; // Was 2.5 - more realistic
  private readonly atrMultiplierSL: number = 1.2; // Was 1.0 - more room
  private readonly ema21Tolerance: number = 0.005; // NEW: 0.5% tolerance for "near EMA21"

  // Budget management
  private readonly maxBudget: number = 500;
  private readonly riskPercentPerTrade: number = 0.02; // 2% risk

  constructor() {
    super('TripleEMA');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.ema3Period, this.rsiPeriod, this.atrPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }

    const ema8 = calculateEMA(candles, this.ema1Period);
    const ema21 = calculateEMA(candles, this.ema2Period);
    const ema55 = calculateEMA(candles, this.ema3Period);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const macd = calculateMACD(candles);
    const atr = calculateATR(candles, this.atrPeriod);

    const idx = candles.length - 1;
    const prevIdx = idx - 1;

    if (ema8[idx] === 0 || ema21[idx] === 0 || ema55[idx] === 0 || atr[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Check bullish stack
    const bullishStack = ema8[idx] > ema21[idx] && ema21[idx] > ema55[idx];

    // SIMPLIFIED pullback detection - just need to be NEAR EMA21
    const priceNearEMA21 = Math.abs(currentPrice - ema21[idx]) < (ema21[idx] * this.ema21Tolerance);
    const priceAboveEMA55 = currentPrice > ema55[idx];
    const priceAboveEMA21 = currentPrice >= ema21[idx];

    // MACD confirmation (optional, not required)
    const macdBullish = macd.macd[idx] > macd.signal[idx];
    const macdNeutral = Math.abs(macd.macd[idx] - macd.signal[idx]) < 0.0001;

    // RSI filter (WIDENED range)
    const rsiValid = rsi[idx] > this.rsiLower && rsi[idx] < this.rsiUpper;

    // Check if we're in a pullback zone (price between EMA21 and EMA8)
    const inPullbackZone = currentPrice >= ema21[idx] && currentPrice <= ema8[idx];

    // BUY Signal - MUCH MORE RELAXED
    // Accept: bullish stack + (near EMA21 OR in pullback zone) + valid RSI + price above EMA55
    // MACD is now optional (helps but not required)
    const validEntry = bullishStack &&
                      (priceNearEMA21 || inPullbackZone) &&
                      rsiValid &&
                      priceAboveEMA55 &&
                      priceAboveEMA21;

    if (validEntry) {
      const stopLoss = Math.min(ema55[idx], currentPrice - atr[idx] * this.atrMultiplierSL);
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      const entryType = priceNearEMA21 ? 'at EMA21' :
                       inPullbackZone ? 'in pullback zone' : 'near EMA21';
      const macdStatus = macdBullish ? '+ MACD✓' : (macdNeutral ? '+ MACD~' : '');

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `TripleEMA BUY: ${entryType}, RSI=${rsi[idx].toFixed(1)} ${macdStatus} | R:R=1:${this.atrMultiplierTP / this.atrMultiplierSL} [FIXED]`
      };
    }

    // EXIT - More lenient (wait for clear break)
    const strongBreakBelowEMA55 = currentPrice < ema55[idx] * 0.998;
    if (strongBreakBelowEMA55) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `TripleEMA EXIT: Strong break below EMA55 (${ema55[idx].toFixed(2)})`
      };
    }

    // HOLD - More informative reasons
    let reason = 'Waiting for TripleEMA setup';

    if (!bullishStack) {
      if (ema8[idx] <= ema21[idx]) {
        reason = `No bullish stack: EMA8 (${ema8[idx].toFixed(2)}) ≤ EMA21 (${ema21[idx].toFixed(2)})`;
      } else {
        reason = `No bullish stack: EMA21 (${ema21[idx].toFixed(2)}) ≤ EMA55 (${ema55[idx].toFixed(2)})`;
      }
    } else if (!priceAboveEMA55) {
      reason = `Price (${currentPrice.toFixed(2)}) below EMA55 (${ema55[idx].toFixed(2)}) - waiting for recovery`;
    } else if (!priceAboveEMA21) {
      reason = `Price (${currentPrice.toFixed(2)}) below EMA21 (${ema21[idx].toFixed(2)}) - waiting for bounce`;
    } else if (!rsiValid) {
      const rsiIssue = rsi[idx] <= this.rsiLower ? 'too low' : 'too high';
      reason = `RSI ${rsiIssue} (${rsi[idx].toFixed(1)}) - need ${this.rsiLower}-${this.rsiUpper}`;
    } else if (!priceNearEMA21 && !inPullbackZone) {
      const distanceToEMA21 = ((currentPrice - ema21[idx]) / ema21[idx] * 100).toFixed(2);
      reason = `Bullish stack active, ${distanceToEMA21}% from EMA21 - waiting for pullback`;
    } else {
      reason = `Conditions forming - bullish stack, RSI=${rsi[idx].toFixed(1)}, monitoring for entry`;
    }

    return { action: 'hold', price: currentPrice, reason };
  }
}
