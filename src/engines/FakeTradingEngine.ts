import { Order, Position, TradeSignal, BotStats } from '../types';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { Logger } from '../utils/logger';

/**
 * Fake Trading Engine
 *
 * Simulates trading with real-time prices but without actually placing orders.
 * This allows testing strategies with live market data in a risk-free environment.
 */
export class FakeTradingEngine {
  private strategy: BaseStrategy;
  private logger: Logger;
  private initialBudget: number;
  private currentBudget: number;
  private orders: Order[] = [];
  private positions: Position[] = [];
  private tradeHistory: { profit: number; win: boolean; timestamp: number }[] = [];
  private isRunning: boolean = false;
  private orderIdCounter: number = 1;

  constructor(strategy: BaseStrategy, initialBudget: number, botName: string) {
    this.strategy = strategy;
    this.initialBudget = initialBudget;
    this.currentBudget = initialBudget;
    this.logger = new Logger(botName);
  }

  /**
   * Start the trading engine
   */
  public start(): void {
    this.isRunning = true;
    this.logger.info(`Started with strategy: ${this.strategy.getName()}, Budget: $${this.initialBudget}`);
  }

  /**
   * Stop the trading engine and close all positions
   */
  public stop(): void {
    this.isRunning = false;
    this.logger.info('Stopping trading engine...');

    // Close all open positions
    if (this.positions.length > 0) {
      this.logger.info(`Closing ${this.positions.length} open position(s)`);
      this.positions = [];
    }

    // Cancel all open orders
    if (this.orders.length > 0) {
      const openOrders = this.orders.filter(o => o.status === 'open');
      this.logger.info(`Cancelling ${openOrders.length} open order(s)`);
      openOrders.forEach(order => {
        order.status = 'cancelled';
      });
    }

    this.logger.info('Trading engine stopped');
  }

  /**
   * Process a trading signal
   */
  public async processSignal(signal: TradeSignal, currentPrice: number): Promise<void> {
    if (!this.isRunning) return;

    this.logger.debug(`Signal: ${signal.action} - ${signal.reason}`);

    switch (signal.action) {
      case 'buy':
        await this.executeBuy(signal, currentPrice);
        break;
      case 'sell':
      case 'close':
        await this.executeClose(currentPrice, signal.reason);
        break;
      case 'hold':
        // Do nothing
        break;
    }

    // Update positions with current price
    this.updatePositions(currentPrice);

    // Check stop loss and take profit
    this.checkExitConditions(currentPrice);
  }

  /**
   * Execute a buy order (open position) - CONSERVATIVE MODE
   */
  private async executeBuy(signal: TradeSignal, currentPrice: number): Promise<void> {
    // Don't open new position if we already have one
    if (this.positions.length > 0) {
      this.logger.debug('Already have open position, skipping buy signal');
      return;
    }

    // Calculate position size - CONSERVATIVE
    // With $500 budget: 6% = $30 per trade (smaller positions, lower risk)
    const maxPositionValue = this.currentBudget * 0.08; // CONSERVATIVE: 8% max (was 40%)
    const positionValue = Math.min(maxPositionValue, this.currentBudget * 0.06); // CONSERVATIVE: 6% default (was 30%)
    const amount = positionValue / currentPrice;

    // Check if we have enough budget
    if (positionValue > this.currentBudget) {
      this.logger.warn('Insufficient budget for trade');
      return;
    }

    // Create order
    const order: Order = {
      id: `FAKE-${this.orderIdCounter++}`,
      symbol: 'BTC/USDT',
      type: 'market',
      side: 'buy',
      price: currentPrice,
      amount,
      filled: amount,
      status: 'closed',
      timestamp: Date.now()
    };

    this.orders.push(order);

    // Create position
    const position: Position = {
      symbol: 'BTC/USDT',
      side: 'long',
      entryPrice: currentPrice,
      amount,
      currentPrice,
      unrealizedPnL: 0,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      timestamp: Date.now()
    };

    this.positions.push(position);
    this.currentBudget -= positionValue;

    this.logger.trade(
      `BUY: ${amount.toFixed(6)} BTC @ $${currentPrice.toFixed(2)} | ` +
      `Value: $${positionValue.toFixed(2)} | ` +
      `SL: ${signal.stopLoss?.toFixed(2)} | TP: ${signal.takeProfit?.toFixed(2)}`
    );
  }

  /**
   * Execute a close order (close position)
   */
  private async executeClose(currentPrice: number, reason: string): Promise<void> {
    if (this.positions.length === 0) {
      return;
    }

    const position = this.positions[0];
    const positionValue = position.amount * currentPrice;
    const profit = positionValue - (position.amount * position.entryPrice);
    const profitPercent = (profit / (position.amount * position.entryPrice)) * 100;

    // Create sell order
    const order: Order = {
      id: `FAKE-${this.orderIdCounter++}`,
      symbol: 'BTC/USDT',
      type: 'market',
      side: 'sell',
      price: currentPrice,
      amount: position.amount,
      filled: position.amount,
      status: 'closed',
      timestamp: Date.now()
    };

    this.orders.push(order);

    // Update budget
    this.currentBudget += positionValue;

    // Record trade
    this.tradeHistory.push({
      profit,
      win: profit > 0,
      timestamp: Date.now()
    });

    this.logger.trade(
      `SELL: ${position.amount.toFixed(6)} BTC @ $${currentPrice.toFixed(2)} | ` +
      `PnL: $${profit.toFixed(2)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%) | ` +
      `Reason: ${reason}`
    );

    // Remove position
    this.positions = [];
  }

  /**
   * Update positions with current price
   */
  private updatePositions(currentPrice: number): void {
    for (const position of this.positions) {
      position.currentPrice = currentPrice;
      const currentValue = position.amount * currentPrice;
      const entryValue = position.amount * position.entryPrice;
      position.unrealizedPnL = currentValue - entryValue;
    }
  }

  /**
   * Check stop loss and take profit conditions
   */
  private checkExitConditions(currentPrice: number): void {
    for (const position of this.positions) {
      // Check stop loss
      if (position.stopLoss && currentPrice <= position.stopLoss) {
        this.logger.warn(`Stop loss triggered at $${currentPrice.toFixed(2)}`);
        this.executeClose(currentPrice, 'Stop loss');
        return;
      }

      // Check take profit
      if (position.takeProfit && currentPrice >= position.takeProfit) {
        this.logger.info(`Take profit triggered at $${currentPrice.toFixed(2)}`);
        this.executeClose(currentPrice, 'Take profit');
        return;
      }
    }
  }

  /**
   * Get current statistics
   */
  public getStats(): BotStats {
    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.win).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const totalPnL = this.tradeHistory.reduce((sum, t) => sum + t.profit, 0);
    const currentDrawdown = ((this.initialBudget - this.currentBudget) / this.initialBudget) * 100;

    return {
      botName: this.strategy.getName(),
      strategy: this.strategy.getName(),
      isRunning: this.isRunning,
      initialBudget: this.initialBudget,
      currentBudget: this.currentBudget,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      openOrders: this.orders.filter(o => o.status === 'open'),
      positions: this.positions,
      totalPnL,
      currentDrawdown
    };
  }

  /**
   * Clear logs
   */
  public clearLogs(): void {
    this.logger.clear();
  }

  /**
   * Get running status
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }
}
