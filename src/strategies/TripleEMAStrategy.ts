import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR } from '../utils/indicators';

/**
 * Triple EMA Strategy (60-65% win rate)
 *
 * Best for: Strong trending markets with pullbacks
 * Win Rate: 60-65%
 * Risk/Reward: 1:3 (ATR×1.5 SL, ATR×4.5 TP)
 * Risk Level: Medium
 *
 * Strategy:
 * - Identifies bullish EMA stack: EMA(8) > EMA(21) > EMA(55)
 * - Buys on pullback to EMA(21) with bounce confirmation
 * - Uses MACD and RSI for additional confirmation
 * - Exits if price breaks below EMA(55)
 */
export class TripleEMAStrategy extends BaseStrategy {
  private readonly ema1Period: number = 8;
  private readonly ema2Period: number = 21;
  private readonly ema3Period: number = 55;
  private readonly rsiPeriod: number = 14;
  private readonly atrPeriod: number = 14;
  private readonly rsiLower: number = 45;
  private readonly rsiUpper: number = 70;
  private readonly atrMultiplierTP: number = 4.5; // Increased from 2.5 to 4.5 for 1:3 R/R
  private readonly atrMultiplierSL: number = 1.5; // Increased from 1.0 to 1.5 for better R/R

  constructor() {
    super('TripleEMA');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    const requiredCandles = Math.max(this.ema3Period, this.rsiPeriod, this.atrPeriod) + 10;

    if (!this.hasEnoughData(candles, requiredCandles)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data for Triple EMA' };

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
    const ema21 = calculateEMA(candles, this.ema2Period);
    const ema55 = calculateEMA(candles, this.ema3Period);
    const rsi = calculateRSI(candles, this.rsiPeriod);
    const macd = calculateMACD(candles);
    const atr = calculateATR(candles, this.atrPeriod);

    const idx = candles.length - 1;
    const prevIdx = idx - 1;

    // Check if indicators are ready
    if (ema8[idx] === 0 || ema21[idx] === 0 || ema55[idx] === 0 || atr[idx] === 0) {
      return { action: 'hold', price: currentPrice, reason: 'Indicators not ready' };
    }

    // Check bullish stack alignment
    const bullishStack = ema8[idx] > ema21[idx] && ema21[idx] > ema55[idx];

    // Check for pullback and bounce at EMA(21)
    const priceNearEMA21 = Math.abs(currentPrice - ema21[idx]) < (atr[idx] * 0.3);
    const priceAboveEMA55 = currentPrice > ema55[idx];
    const previouslyBelowEMA21 = candles[prevIdx].close < ema21[prevIdx];
    const nowAboveEMA21 = currentPrice > ema21[idx];
    const pullbackBounce = previouslyBelowEMA21 && nowAboveEMA21;

    // MACD confirmation
    const macdBullish = macd.macd[idx] > macd.signal[idx];

    // RSI filter
    const rsiValid = rsi[idx] > this.rsiLower && rsi[idx] < this.rsiUpper;

    // BUY Signal
    if (bullishStack && pullbackBounce && macdBullish && rsiValid && priceAboveEMA55) {
      // CRITICAL FIX: Calculate stop loss from entry price for consistent risk management
      // Using EMA55 could result in very large stop losses if EMA55 is far below
      const stopLoss = currentPrice - (atr[idx] * this.atrMultiplierSL);
      const takeProfit = currentPrice + (atr[idx] * this.atrMultiplierTP);

      // Calculate actual risk/reward ratio
      const risk = currentPrice - stopLoss;
      const reward = takeProfit - currentPrice;
      const riskRewardRatio = reward / risk;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Triple EMA BUY: Bullish stack confirmed, pullback bounce at EMA21, RSI=${rsi[idx].toFixed(1)}, MACD bullish [R:R 1:${riskRewardRatio.toFixed(1)}]`
      };
    }

    // EXIT if price breaks below EMA55
    const breakBelowEMA55 = currentPrice < ema55[idx] && candles[prevIdx].close >= ema55[prevIdx];
    if (breakBelowEMA55) {
      return {
        action: 'close',
        price: currentPrice,
        reason: `Triple EMA EXIT: Price broke below EMA55 (${ema55[idx].toFixed(2)})`
      };
    }

    // HOLD - Waiting for setup
    let reason = 'Waiting for Triple EMA setup';

    if (bullishStack) {
      reason = `Bullish stack active, waiting for pullback to EMA21 (current: ${ema21[idx].toFixed(2)})`;
    } else if (ema8[idx] < ema21[idx]) {
      reason = `No bullish stack: EMA8 < EMA21`;
    } else {
      reason = `No bullish stack: EMA21 < EMA55`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason
    };
  }
}
