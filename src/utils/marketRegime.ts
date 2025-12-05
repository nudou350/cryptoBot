import { Candle } from '../types';
import { calculateADX, calculateATR, calculateBollingerBands } from './indicators';

/**
 * Market Regime Detection - CONSERVATIVE MODE
 *
 * Determines current market conditions to filter trade entries.
 * Strategies should only trade in their optimal conditions.
 *
 * Regimes:
 * - TRENDING: ADX > 25, use trend-following strategies (Hybrid)
 * - RANGING: ADX < 22 & BB Width < 3.5%, use mean reversion/grid strategies
 * - HIGH_VOLATILITY: ATR/Price > 3%, reduce position size or stay out
 * - UNCLEAR: Mixed signals, conservative approach = stay out
 */

export interface MarketRegime {
  regime: 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'UNCLEAR';
  adx: number;
  bbWidth: number;
  volatilityRatio: number;
  canTradeMeanReversion: boolean;
  canTradeGrid: boolean;
  canTradeTrend: boolean;
  recommendation: string;
}

/**
 * Detect current market regime from candle data
 *
 * @param candles - Array of candle data (minimum 50 candles required)
 * @param currentPrice - Current market price
 * @returns MarketRegime object with trading recommendations
 */
export function detectMarketRegime(candles: Candle[], currentPrice: number): MarketRegime {
  // Validate data
  if (candles.length < 50) {
    return {
      regime: 'UNCLEAR',
      adx: 0,
      bbWidth: 0,
      volatilityRatio: 0,
      canTradeMeanReversion: false,
      canTradeGrid: false,
      canTradeTrend: false,
      recommendation: 'Insufficient data for regime detection'
    };
  }

  // Calculate indicators
  const adxValues = calculateADX(candles, 14);
  const atrValues = calculateATR(candles, 14);
  const bbValues = calculateBollingerBands(candles, 20, 2);

  // Get latest values
  const adx = adxValues[adxValues.length - 1] || 0;
  const atr = atrValues[atrValues.length - 1] || 0;
  const bbUpper = bbValues.upper[bbValues.upper.length - 1] || currentPrice;
  const bbLower = bbValues.lower[bbValues.lower.length - 1] || currentPrice;
  const bbMiddle = bbValues.middle[bbValues.middle.length - 1] || currentPrice;

  // Calculate Bollinger Band Width as percentage
  const bbWidth = bbMiddle > 0 ? ((bbUpper - bbLower) / bbMiddle) * 100 : 0;

  // Calculate volatility ratio (ATR / Price as percentage)
  const volatilityRatio = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  // Determine regime
  let regime: 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'UNCLEAR';
  let canTradeMeanReversion = false;
  let canTradeGrid = false;
  let canTradeTrend = false;
  let recommendation = '';

  // HIGH VOLATILITY CHECK (priority - overrides other regimes)
  if (volatilityRatio > 3) {
    regime = 'HIGH_VOLATILITY';
    recommendation = 'High volatility detected. Reduce position sizes by 50% or stay out.';
  }
  // TRENDING MARKET
  else if (adx > 25) {
    regime = 'TRENDING';
    canTradeTrend = true;
    recommendation = 'Trending market. Use Hybrid/Pullback strategy. Avoid Mean Reversion and Grid.';
  }
  // RANGING MARKET (strict criteria)
  else if (adx < 22 && bbWidth < 3.5) {
    regime = 'RANGING';
    canTradeMeanReversion = true;
    canTradeGrid = true;
    recommendation = 'Ranging market. Use Mean Reversion or Grid strategy. Avoid Trend strategies.';
  }
  // UNCLEAR - conservative = no trading
  else {
    regime = 'UNCLEAR';
    recommendation = 'Mixed signals. Conservative approach: wait for clearer conditions.';
  }

  return {
    regime,
    adx,
    bbWidth,
    volatilityRatio,
    canTradeMeanReversion,
    canTradeGrid,
    canTradeTrend,
    recommendation
  };
}

/**
 * Check if price is at or below Bollinger Lower Band
 * Used by Mean Reversion strategy for entry confirmation
 */
export function isBelowBollingerLower(candles: Candle[], currentPrice: number, period = 20, stdDev = 2): boolean {
  const bbValues = calculateBollingerBands(candles, period, stdDev);
  const lowerBand = bbValues.lower[bbValues.lower.length - 1] || 0;
  return currentPrice <= lowerBand;
}

/**
 * Check if candle is bullish (close > open)
 * Used by Hybrid strategy for entry confirmation
 */
export function isBullishCandle(candle: Candle): boolean {
  return candle.close > candle.open;
}

/**
 * Calculate Bollinger Band Width as percentage
 * Used to identify low volatility ranging conditions
 */
export function calculateBollingerWidth(candles: Candle[], period = 20, stdDev = 2): number {
  const bbValues = calculateBollingerBands(candles, period, stdDev);
  const upper = bbValues.upper[bbValues.upper.length - 1] || 0;
  const lower = bbValues.lower[bbValues.lower.length - 1] || 0;
  const middle = bbValues.middle[bbValues.middle.length - 1] || 0;

  if (middle === 0) return 0;
  return ((upper - lower) / middle) * 100;
}

/**
 * Check EMA alignment for trending market
 * Bullish stack: EMA9 > EMA21 > EMA50
 */
export function isEmaAlignedBullish(ema9: number, ema21: number, ema50: number): boolean {
  return ema9 > ema21 && ema21 > ema50;
}

/**
 * Get volume confirmation
 * @returns true if current volume is above the multiplier * average
 */
export function hasVolumeConfirmation(candles: Candle[], period = 20, multiplier = 1.0): boolean {
  if (candles.length < period + 1) return false;

  // Calculate average volume over period (excluding current candle)
  let sumVolume = 0;
  for (let i = candles.length - period - 1; i < candles.length - 1; i++) {
    sumVolume += candles[i].volume;
  }
  const avgVolume = sumVolume / period;

  // Get current candle volume
  const currentVolume = candles[candles.length - 1].volume;

  return currentVolume >= avgVolume * multiplier;
}
