import { Candle, TradeSignal } from '../types';

export abstract class BaseStrategy {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  /**
   * Analyze market data and generate trading signal
   */
  public abstract analyze(candles: Candle[], currentPrice: number): TradeSignal;

  /**
   * Calculate position size based on risk management
   */
  protected calculatePositionSize(
    capital: number,
    entryPrice: number,
    stopLoss: number,
    riskPercentage: number = 0.02
  ): number {
    const riskAmount = capital * riskPercentage;
    const priceRisk = Math.abs(entryPrice - stopLoss);

    if (priceRisk === 0) return 0;

    const positionSize = riskAmount / priceRisk;
    const maxPositionValue = capital * 0.10; // Max 10% of capital per position
    const maxPositionSize = maxPositionValue / entryPrice;

    return Math.min(positionSize, maxPositionSize);
  }

  /**
   * Validate if enough data is available for analysis
   */
  protected hasEnoughData(candles: Candle[], requiredCandles: number): boolean {
    return candles.length >= requiredCandles;
  }
}
