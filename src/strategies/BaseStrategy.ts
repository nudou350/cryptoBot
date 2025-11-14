import { Candle, TradeSignal } from '../types';

export abstract class BaseStrategy {
  protected name: string;
  protected lastTradeTime: number = 0;
  protected readonly MIN_TRADE_COOLDOWN: number = 15 * 60 * 1000; // 15 minutes in milliseconds

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
    riskPercentage: number = 0.025 // 2.5% risk per trade (increased from 2%)
  ): number {
    const riskAmount = capital * riskPercentage;
    const priceRisk = Math.abs(entryPrice - stopLoss);

    if (priceRisk === 0) return 0;

    const positionSize = riskAmount / priceRisk;
    const maxPositionValue = capital * 0.15; // Max 15% of capital per position (increased from 10%)
    const maxPositionSize = maxPositionValue / entryPrice;

    return Math.min(positionSize, maxPositionSize);
  }

  /**
   * Validate if enough data is available for analysis
   */
  protected hasEnoughData(candles: Candle[], requiredCandles: number): boolean {
    return candles.length >= requiredCandles;
  }

  /**
   * Check if enough time has passed since last trade (15 min cooldown)
   */
  protected canTradeAgain(): boolean {
    const now = Date.now();
    const timeSinceLastTrade = now - this.lastTradeTime;
    return timeSinceLastTrade >= this.MIN_TRADE_COOLDOWN;
  }

  /**
   * Update last trade time (call when entering a trade)
   */
  public recordTrade(): void {
    this.lastTradeTime = Date.now();
  }

  /**
   * Get remaining cooldown time in minutes
   */
  protected getRemainingCooldown(): number {
    const now = Date.now();
    const timeSinceLastTrade = now - this.lastTradeTime;
    const remainingMs = Math.max(0, this.MIN_TRADE_COOLDOWN - timeSinceLastTrade);
    return Math.ceil(remainingMs / 60000); // Convert to minutes
  }
}
