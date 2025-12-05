import { Candle, TradeSignal } from '../types';

export abstract class BaseStrategy {
  protected name: string;
  protected lastTradeTime: number = 0;
  // CONSERVATIVE: 30 minute cooldown (was 15 minutes)
  protected readonly MIN_TRADE_COOLDOWN: number = 30 * 60 * 1000; // 30 minutes in milliseconds

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
   * CONSERVATIVE MODE: Lower risk, smaller positions
   */
  protected calculatePositionSize(
    capital: number,
    entryPrice: number,
    stopLoss: number,
    riskPercentage: number = 0.015 // CONSERVATIVE: 1.5% risk per trade (was 2.5%)
  ): number {
    const riskAmount = capital * riskPercentage;
    const priceRisk = Math.abs(entryPrice - stopLoss);

    if (priceRisk === 0) return 0;

    const positionSize = riskAmount / priceRisk;
    const maxPositionValue = capital * 0.08; // CONSERVATIVE: Max 8% of capital per position (was 15%)
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

  /**
   * Restore strategy state from an existing position
   * This is called when the bot restarts and finds an existing position
   * Subclasses should override this to restore their internal state
   */
  public restorePositionState(entryPrice: number, currentPrice: number): void {
    // Base implementation does nothing
    // Subclasses should override to restore their specific state
  }
}
