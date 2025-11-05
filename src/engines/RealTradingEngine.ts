import ccxt from 'ccxt';
import { Order, Position, TradeSignal, BotStats } from '../types';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { Logger } from '../utils/logger';

/**
 * Real Trading Engine
 *
 * Executes actual trades on Binance exchange.
 * USE WITH CAUTION - TRADES WITH REAL MONEY!
 */
export class RealTradingEngine {
  private strategy: BaseStrategy;
  private logger: Logger;
  private exchange: any;
  private initialBudget: number;
  private currentBudget: number;
  private orders: Order[] = [];
  private positions: Position[] = [];
  private tradeHistory: { profit: number; win: boolean; timestamp: number }[] = [];
  private isRunning: boolean = false;
  private symbol: string = 'BTC/USDT';

  constructor(
    strategy: BaseStrategy,
    initialBudget: number,
    botName: string,
    apiKey: string,
    apiSecret: string
  ) {
    this.strategy = strategy;
    this.initialBudget = initialBudget;
    this.currentBudget = initialBudget;
    this.logger = new Logger(botName);

    // Initialize Binance exchange
    this.exchange = new ccxt.binance({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: 'spot'
      }
    });
  }

  /**
   * Start the trading engine
   */
  public async start(): Promise<void> {
    try {
      // Test connection
      await this.exchange.loadMarkets();

      // Get account balance
      const balance = await this.exchange.fetchBalance();
      const usdtBalance = balance.USDT?.free || 0;

      this.logger.info(`Connected to Binance`);
      this.logger.info(`USDT Balance: $${usdtBalance.toFixed(2)}`);
      this.logger.info(`Strategy: ${this.strategy.getName()}`);
      this.logger.info(`Allocated Budget: $${this.initialBudget}`);

      if (usdtBalance < this.initialBudget) {
        this.logger.warn(
          `Warning: USDT balance ($${usdtBalance.toFixed(2)}) is less than allocated budget ($${this.initialBudget})`
        );
      }

      this.isRunning = true;
      this.logger.info('Real trading engine started');
    } catch (error: any) {
      this.logger.error(`Failed to start: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop the trading engine and close all positions
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('Stopping trading engine...');

    try {
      // Close all open positions
      if (this.positions.length > 0) {
        this.logger.info(`Closing ${this.positions.length} open position(s)`);
        const currentPrice = await this.getCurrentPrice();
        for (const position of this.positions) {
          await this.executeClose(currentPrice, 'Manual stop');
        }
      }

      // Cancel all open orders
      const openOrders = await this.exchange.fetchOpenOrders(this.symbol);
      if (openOrders.length > 0) {
        this.logger.info(`Cancelling ${openOrders.length} open order(s)`);
        for (const order of openOrders) {
          await this.exchange.cancelOrder(order.id, this.symbol);
        }
      }

      this.logger.info('Trading engine stopped');
    } catch (error: any) {
      this.logger.error(`Error stopping engine: ${error.message}`);
    }
  }

  /**
   * Process a trading signal
   */
  public async processSignal(signal: TradeSignal, currentPrice: number): Promise<void> {
    if (!this.isRunning) return;

    this.logger.debug(`Signal: ${signal.action} - ${signal.reason}`);

    try {
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

      // Update positions
      await this.updatePositions(currentPrice);

      // Check exit conditions
      await this.checkExitConditions(currentPrice);
    } catch (error: any) {
      this.logger.error(`Error processing signal: ${error.message}`);
    }
  }

  /**
   * Execute a buy order
   */
  private async executeBuy(signal: TradeSignal, currentPrice: number): Promise<void> {
    // Don't open new position if we already have one
    if (this.positions.length > 0) {
      this.logger.debug('Already have open position, skipping buy signal');
      return;
    }

    try {
      // Calculate position size
      const maxPositionValue = this.currentBudget * 0.10;
      const positionValue = Math.min(maxPositionValue, this.currentBudget * 0.08);
      const amount = positionValue / currentPrice;

      // Round amount to exchange precision
      const roundedAmount = this.exchange.amountToPrecision(this.symbol, amount);

      // Check minimum order size
      const market = this.exchange.market(this.symbol);
      if (parseFloat(roundedAmount) < market.limits.amount.min) {
        this.logger.warn(`Order size too small: ${roundedAmount} < ${market.limits.amount.min}`);
        return;
      }

      // Place market order
      const order = await this.exchange.createMarketBuyOrder(this.symbol, parseFloat(roundedAmount));

      this.logger.trade(
        `BUY: ${roundedAmount} BTC @ $${currentPrice.toFixed(2)} | ` +
        `Value: $${positionValue.toFixed(2)} | ` +
        `Order ID: ${order.id}`
      );

      // Create position
      const position: Position = {
        symbol: this.symbol,
        side: 'long',
        entryPrice: order.average || currentPrice,
        amount: parseFloat(roundedAmount),
        currentPrice,
        unrealizedPnL: 0,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        timestamp: Date.now()
      };

      this.positions.push(position);
      this.currentBudget -= positionValue;

      // Place stop loss order if specified
      if (signal.stopLoss) {
        await this.placeStopLoss(parseFloat(roundedAmount), signal.stopLoss);
      }
    } catch (error: any) {
      this.logger.error(`Error executing buy: ${error.message}`);
    }
  }

  /**
   * Execute a close order
   */
  private async executeClose(currentPrice: number, reason: string): Promise<void> {
    if (this.positions.length === 0) {
      return;
    }

    try {
      const position = this.positions[0];
      const roundedAmount = this.exchange.amountToPrecision(this.symbol, position.amount);

      // Place market sell order
      const order = await this.exchange.createMarketSellOrder(this.symbol, parseFloat(roundedAmount));

      const positionValue = position.amount * (order.average || currentPrice);
      const profit = positionValue - (position.amount * position.entryPrice);
      const profitPercent = (profit / (position.amount * position.entryPrice)) * 100;

      this.currentBudget += positionValue;

      // Record trade
      this.tradeHistory.push({
        profit,
        win: profit > 0,
        timestamp: Date.now()
      });

      this.logger.trade(
        `SELL: ${roundedAmount} BTC @ $${currentPrice.toFixed(2)} | ` +
        `PnL: $${profit.toFixed(2)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%) | ` +
        `Reason: ${reason} | Order ID: ${order.id}`
      );

      // Remove position
      this.positions = [];

      // Cancel any existing stop loss orders
      const openOrders = await this.exchange.fetchOpenOrders(this.symbol);
      for (const openOrder of openOrders) {
        if (openOrder.type === 'stop_loss_limit') {
          await this.exchange.cancelOrder(openOrder.id, this.symbol);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error executing close: ${error.message}`);
    }
  }

  /**
   * Place stop loss order
   */
  private async placeStopLoss(amount: number, stopLoss: number): Promise<void> {
    try {
      // Note: Binance requires stop-limit orders
      const stopPrice = this.exchange.priceToPrecision(this.symbol, stopLoss);
      const limitPrice = this.exchange.priceToPrecision(this.symbol, stopLoss * 0.99);

      // This is a placeholder - actual implementation depends on exchange support
      this.logger.info(`Stop loss set at $${stopPrice} (manual monitoring)`);
    } catch (error: any) {
      this.logger.error(`Error placing stop loss: ${error.message}`);
    }
  }

  /**
   * Get current price from exchange
   */
  private async getCurrentPrice(): Promise<number> {
    const ticker = await this.exchange.fetchTicker(this.symbol);
    return ticker.last || 0;
  }

  /**
   * Update positions with current price
   */
  private async updatePositions(currentPrice: number): Promise<void> {
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
  private async checkExitConditions(currentPrice: number): Promise<void> {
    for (const position of this.positions) {
      // Check stop loss
      if (position.stopLoss && currentPrice <= position.stopLoss) {
        this.logger.warn(`Stop loss triggered at $${currentPrice.toFixed(2)}`);
        await this.executeClose(currentPrice, 'Stop loss');
        return;
      }

      // Check take profit
      if (position.takeProfit && currentPrice >= position.takeProfit) {
        this.logger.info(`Take profit triggered at $${currentPrice.toFixed(2)}`);
        await this.executeClose(currentPrice, 'Take profit');
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
