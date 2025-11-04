import { Candle } from '../types';

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(candles: Candle[], period: number): number[] {
  const sma: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      sma.push(0);
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    sma.push(sum / period);
  }

  return sma;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period && i < candles.length; i++) {
    sum += candles[i].close;
  }
  ema[period - 1] = sum / period;

  // Calculate remaining EMAs
  for (let i = period; i < candles.length; i++) {
    ema[i] = (candles[i].close - ema[i - 1]) * multiplier + ema[i - 1];
  }

  // Fill initial values with 0
  for (let i = 0; i < period - 1; i++) {
    ema[i] = 0;
  }

  return ema;
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function calculateRSI(candles: Candle[], period: number = 14): number[] {
  const rsi: number[] = [];
  const changes: number[] = [];

  // Calculate price changes
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  for (let i = 0; i < changes.length; i++) {
    if (i < period - 1) {
      rsi.push(0);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = 0; j < period; j++) {
      const change = changes[i - j];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  // Add initial 0 for first candle
  rsi.unshift(0);

  return rsi;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(candles: Candle[], period: number = 20, stdDev: number = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
} {
  const middle = calculateSMA(candles, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(0);
      lower.push(0);
      continue;
    }

    // Calculate standard deviation
    let sum = 0;
    for (let j = 0; j < period; j++) {
      const diff = candles[i - j].close - middle[i];
      sum += diff * diff;
    }
    const std = Math.sqrt(sum / period);

    upper.push(middle[i] + (stdDev * std));
    lower.push(middle[i] - (stdDev * std));
  }

  return { upper, middle, lower };
}

/**
 * Calculate Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const atr: number[] = [];
  const tr: number[] = [];

  // Calculate True Range
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    tr.push(Math.max(tr1, tr2, tr3));
  }

  // Calculate ATR (SMA of TR)
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      atr.push(0);
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += tr[i - j];
    }
    atr.push(sum / period);
  }

  // Add initial 0s
  atr.unshift(0);

  return atr;
}

/**
 * Calculate Average Directional Index (ADX)
 */
export function calculateADX(candles: Candle[], period: number = 14): number[] {
  const adx: number[] = [];

  if (candles.length < period + 1) {
    return new Array(candles.length).fill(0);
  }

  // Calculate +DM, -DM, and TR
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    tr.push(Math.max(tr1, tr2, tr3));
  }

  // Calculate smoothed values and ADX
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      adx.push(0);
      continue;
    }

    let sumPlusDM = 0;
    let sumMinusDM = 0;
    let sumTR = 0;

    for (let j = 0; j < period; j++) {
      sumPlusDM += plusDM[i - j];
      sumMinusDM += minusDM[i - j];
      sumTR += tr[i - j];
    }

    const plusDI = sumTR > 0 ? (sumPlusDM / sumTR) * 100 : 0;
    const minusDI = sumTR > 0 ? (sumMinusDM / sumTR) * 100 : 0;
    const dx = (plusDI + minusDI) > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;

    adx.push(dx);
  }

  // Add initial 0
  adx.unshift(0);

  return adx;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(candles: Candle[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);
  const macd: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (fastEMA[i] === 0 || slowEMA[i] === 0) {
      macd.push(0);
    } else {
      macd.push(fastEMA[i] - slowEMA[i]);
    }
  }

  // Create temporary candles for signal line calculation
  const macdCandles: Candle[] = macd.map((value, index) => ({
    ...candles[index],
    close: value
  }));

  const signal = calculateEMA(macdCandles, signalPeriod);
  const histogram = macd.map((value, index) => value - signal[index]);

  return { macd, signal, histogram };
}
