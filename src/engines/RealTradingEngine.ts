import ccxt from 'ccxt';
import { Order, Position, TradeSignal, BotStats, TradeRecord } from '../types';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { Logger } from '../utils/logger';

/**
 * Real Trading Engine - PRODUCTION READY WITH SAFETY FEATURES
 *
 * Executes actual trades on Binance exchange with comprehensive risk management.
 * USE WITH CAUTION - TRADES WITH REAL MONEY!
 *
 * Safety Features:
 * - Exchange-enforced stop losses
 * - Emergency drawdown protection
 * - Position reconciliation on startup
 * - Order fill verification
 * - Slippage monitoring
 * - Periodic balance verification
 * - Connection health checks
 */
export class RealTradingEngine {
  private strategy: BaseStrategy;
  private logger: Logger;
  private exchange: any;
  private initialBudget: number; // Allocated budget for position sizing
  private currentBudget: number; // Tracked budget for position sizing

  // REAL BALANCE TRACKING (for P&L and drawdown calculations)
  private initialRealBalance: number = 0; // Real USDT balance on startup
  private currentRealBalance: number = 0; // Current real USDT balance

  private orders: Order[] = [];
  private positions: Position[] = [];
  private tradeHistory: TradeRecord[] = [];
  private isRunning: boolean = false;
  private symbol: string = 'BTC/USDT';

  // Safety tracking
  private emergencyStopTriggered: boolean = false;
  private maxDrawdownLimit: number = 0.15; // 15% max drawdown
  private openStopLossOrders: Map<string, string> = new Map(); // positionId -> stopLossOrderId
  private lastBalanceCheck: number = 0;
  private balanceCheckInterval: number = 10 * 60 * 1000; // 10 minutes
  private expectedBalance: number = 0;
  private slippageHistory: number[] = [];
  private connectionHealthy: boolean = false;
  private lastConnectionCheck: number = 0;

  constructor(
    strategy: BaseStrategy,
    initialBudget: number,
    botName: string,
    apiKey: string,
    apiSecret: string,
    isTestnet: boolean = false
  ) {
    this.strategy = strategy;
    this.initialBudget = initialBudget;
    this.currentBudget = initialBudget;
    this.logger = new Logger(botName);

    // Initialize Binance exchange
    const exchangeConfig: any = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: 'spot'
      }
    };

    // Configure for testnet if specified
    if (isTestnet) {
      // CCXT uses 'sandbox' mode for testnet
      exchangeConfig.options.sandbox = true;
      this.logger.info('Configured for Binance Spot Testnet (Sandbox Mode)');
      this.logger.info(`API Endpoint: Testnet (sandbox enabled)`);
    } else {
      this.logger.info('Configured for Binance Production');
      this.logger.info(`API Endpoint: Production (https://api.binance.com)`);
    }

    this.exchange = new ccxt.binance(exchangeConfig);

    // Log the actual URLs being used (for verification)
    if (this.exchange.urls) {
      this.logger.info(`Exchange URLs: ${JSON.stringify(this.exchange.urls.api || 'default')}`);
    }
  }

  /**
   * Start the trading engine with comprehensive safety checks
   */
  public async start(): Promise<void> {
    try {
      // Test connection
      await this.exchange.loadMarkets();
      this.connectionHealthy = true;
      this.lastConnectionCheck = Date.now();

      // Get account balance - CRITICAL FOR REAL P&L TRACKING
      const balance = await this.exchange.fetchBalance();
      const usdtBalance = balance.USDT?.free || 0;
      const btcBalance = balance.BTC?.free || 0;

      // Detect multi-bot mode: allocated budget much smaller than total balance
      const isMultiBotMode = this.initialBudget < usdtBalance * 0.5;

      // Initialize balance tracking based on mode
      if (isMultiBotMode) {
        // MULTI-BOT MODE: Use allocated budget for P&L tracking
        // Each bot tracks its own P&L independently
        this.initialRealBalance = this.initialBudget;
        this.currentRealBalance = this.initialBudget;
        this.expectedBalance = this.initialBudget;
      } else {
        // SINGLE-BOT MODE: Use real exchange balance for P&L tracking
        this.initialRealBalance = usdtBalance;
        this.currentRealBalance = usdtBalance;
        this.expectedBalance = usdtBalance;
      }

      this.logger.info('═══════════════════════════════════════════════════════');
      this.logger.info('   REAL TRADING ENGINE - BALANCE INITIALIZATION      ');
      this.logger.info('═══════════════════════════════════════════════════════');
      this.logger.info(`Exchange: Binance ${this.exchange.options?.sandbox ? 'Testnet' : 'Production'}`);
      this.logger.info(`Strategy: ${this.strategy.getName()}`);
      this.logger.info(`Mode: ${isMultiBotMode ? 'MULTI-BOT (Isolated Budgets)' : 'SINGLE-BOT (Full Balance)'}`);
      this.logger.info('');
      this.logger.info('REAL EXCHANGE BALANCES:');
      this.logger.info(`  USDT Balance: $${usdtBalance.toFixed(2)}`);
      this.logger.info(`  BTC Balance: ${btcBalance.toFixed(8)} BTC`);
      this.logger.info('');
      this.logger.info('BOT ALLOCATION:');
      this.logger.info(`  Allocated Budget: $${this.initialBudget.toFixed(2)}`);
      this.logger.info(`  P&L Tracking Base: $${this.initialRealBalance.toFixed(2)}`);
      if (isMultiBotMode) {
        this.logger.info('  Note: P&L calculated relative to allocated budget, not total exchange balance');
      }
      this.logger.info('');
      this.logger.info('RISK MANAGEMENT:');
      this.logger.info(`  Max Drawdown Limit: ${(this.maxDrawdownLimit * 100).toFixed(0)}%`);
      this.logger.info(`  Emergency Stop Trigger: Real balance drops to $${(usdtBalance * (1 - this.maxDrawdownLimit)).toFixed(2)}`);
      this.logger.info('═══════════════════════════════════════════════════════');

      // Warning if allocated budget exceeds real balance
      if (this.initialBudget > usdtBalance) {
        this.logger.warn('═══════════════════════════════════════════════════════');
        this.logger.warn('   WARNING: ALLOCATED BUDGET EXCEEDS REAL BALANCE    ');
        this.logger.warn('═══════════════════════════════════════════════════════');
        this.logger.warn(`Allocated Budget: $${this.initialBudget.toFixed(2)}`);
        this.logger.warn(`Real USDT Balance: $${usdtBalance.toFixed(2)}`);
        this.logger.warn('Position sizing will be constrained by real balance');
        this.logger.warn('═══════════════════════════════════════════════════════');
      }

      // CRITICAL: Reconcile existing positions and orders
      await this.reconcilePositionsOnStartup();
      await this.cancelOrphanedOrders();

      this.isRunning = true;
      this.lastBalanceCheck = Date.now();
      this.logger.info('Real trading engine started with safety features enabled');
      this.logger.info('Safety Features: Stop Loss Orders | Emergency Drawdown | Balance Verification | Slippage Monitoring');
    } catch (error: any) {
      this.logger.error(`Failed to start: ${error.message}`);
      throw error;
    }
  }

  /**
   * SAFETY: Reconcile existing positions on startup
   * Fetches open positions from exchange and loads them into memory
   *
   * MULTI-BOT MODE: When running multiple bots with split budgets, this is skipped
   * to prevent multiple bots from claiming the same position.
   */
  private async reconcilePositionsOnStartup(): Promise<void> {
    try {
      // Check if we're in multi-bot mode (allocated budget much smaller than real balance)
      const balance = await this.exchange.fetchBalance();
      const totalBalance = balance.USDT?.free || 0;

      // If allocated budget is less than 50% of total balance, we're in multi-bot mode
      // Skip reconciliation to prevent multiple bots from claiming same positions
      if (this.initialBudget < totalBalance * 0.5) {
        this.logger.info('Multi-bot mode detected - skipping position reconciliation');
        this.logger.info(`Allocated Budget: $${this.initialBudget.toFixed(2)} | Total Balance: $${totalBalance.toFixed(2)}`);
        this.logger.info('Bot will start fresh with no existing positions');
        return;
      }

      this.logger.info('Reconciling positions from exchange...');

      // Fetch all open orders (including stop losses)
      const openOrders = await this.exchange.fetchOpenOrders(this.symbol);

      // Check if there are any open positions on the exchange
      // For spot trading, check if we have BTC balance
      const btcBalance = balance.BTC?.free || 0;

      if (btcBalance > 0) {
        const currentPrice = await this.getCurrentPrice();
        const positionValue = btcBalance * currentPrice;

        this.logger.warn(`FOUND EXISTING POSITION: ${btcBalance.toFixed(8)} BTC worth $${positionValue.toFixed(2)}`);

        // Create position object
        const position: Position = {
          symbol: this.symbol,
          side: 'long',
          entryPrice: currentPrice, // We don't know actual entry, use current
          amount: btcBalance,
          currentPrice,
          unrealizedPnL: 0,
          timestamp: Date.now(),
        };

        // Check for existing stop loss orders
        const stopLossOrders = openOrders.filter(
          (o: any) => o.type === 'STOP_LOSS_LIMIT' && o.side === 'SELL'
        );

        if (stopLossOrders.length > 0) {
          const stopLossOrder = stopLossOrders[0];
          position.stopLoss = stopLossOrder.stopPrice || stopLossOrder.price;
          position.stopLossOrderId = stopLossOrder.id;
          this.openStopLossOrders.set(`${this.symbol}_0`, stopLossOrder.id);
          this.logger.info(`Found existing stop loss order: ${stopLossOrder.id} @ $${position.stopLoss?.toFixed(2)}`);
        } else {
          this.logger.warn('Position exists but NO STOP LOSS FOUND - Risk management compromised!');
        }

        this.positions.push(position);
        this.logger.info('Position loaded into trading engine');
      } else {
        this.logger.info('No existing positions found - starting fresh');
      }
    } catch (error: any) {
      this.logger.error(`Error reconciling positions: ${error.message}`);
      // Don't throw - continue with empty positions
    }
  }

  /**
   * SAFETY: Cancel any orphaned stop loss orders from previous sessions
   */
  private async cancelOrphanedOrders(): Promise<void> {
    try {
      const openOrders = await this.exchange.fetchOpenOrders(this.symbol);

      if (openOrders.length > 0) {
        this.logger.warn(`Found ${openOrders.length} open order(s) from previous session`);

        for (const order of openOrders) {
          // If we don't have a corresponding position, cancel the order
          const isOrphaned = !this.positions.some(p => p.stopLossOrderId === order.id);

          if (isOrphaned && order.type === 'STOP_LOSS_LIMIT') {
            this.logger.warn(`Cancelling orphaned stop loss order: ${order.id}`);
            try {
              await this.exchange.cancelOrder(order.id, this.symbol);
              this.logger.info(`Orphaned order ${order.id} cancelled`);
            } catch (cancelError: any) {
              this.logger.error(`Failed to cancel orphaned order ${order.id}: ${cancelError.message}`);
            }
          }
        }
      } else {
        this.logger.info('No orphaned orders found');
      }
    } catch (error: any) {
      this.logger.error(`Error checking for orphaned orders: ${error.message}`);
      // Don't throw - continue
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
   * Process a trading signal with comprehensive safety checks
   */
  public async processSignal(signal: TradeSignal, currentPrice: number): Promise<void> {
    if (!this.isRunning) return;

    // CRITICAL: Check emergency stop status
    if (this.emergencyStopTriggered) {
      this.logger.error('EMERGENCY STOP ACTIVE - No new trades allowed');
      return;
    }

    this.logger.debug(`Signal: ${signal.action} - ${signal.reason}`);

    try {
      // SAFETY: Verify connection health before trading
      await this.checkConnectionHealth();

      // CRITICAL: Check drawdown limit before each trade
      const drawdownExceeded = await this.checkDrawdownLimit();
      if (drawdownExceeded) {
        return; // Emergency stop has been triggered
      }

      // SAFETY: Periodic balance verification
      await this.verifyBalanceIfNeeded();

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
      this.connectionHealthy = false;
    }
  }

  /**
   * CRITICAL SAFETY: Check if maximum drawdown limit has been exceeded
   * If exceeded, trigger emergency stop and close all positions
   *
   * FIXED: Now uses REAL exchange balance, not allocated budget
   */
  private async checkDrawdownLimit(): Promise<boolean> {
    // Fetch current REAL balance from exchange
    try {
      const balance = await this.exchange.fetchBalance();
      const currentUsdtBalance = balance.USDT?.free || 0;
      const btcBalance = balance.BTC?.free || 0;

      // Detect multi-bot mode
      const isMultiBotMode = this.initialBudget < currentUsdtBalance * 0.5;

      let totalAccountValue: number;

      if (isMultiBotMode) {
        // MULTI-BOT MODE: Use tracked currentRealBalance (not exchange balance)
        // This bot's balance is tracked separately and only updated by trade P&L
        totalAccountValue = this.currentRealBalance;

        // Add value of this bot's position if it exists
        if (this.positions.length > 0) {
          const currentPrice = await this.getCurrentPrice();
          const positionValue = this.positions[0].amount * currentPrice;
          totalAccountValue = this.currentBudget + (positionValue - (this.positions[0].amount * this.positions[0].entryPrice));
        }
      } else {
        // SINGLE-BOT MODE: Use real exchange balance
        this.currentRealBalance = currentUsdtBalance;
        totalAccountValue = currentUsdtBalance;

        if (btcBalance > 0) {
          const currentPrice = await this.getCurrentPrice();
          totalAccountValue += (btcBalance * currentPrice);
        }
      }

      // Calculate drawdown from REAL initial balance
      const currentDrawdown = Math.abs((totalAccountValue - this.initialRealBalance) / this.initialRealBalance);
      const loss = this.initialRealBalance - totalAccountValue;

      if (currentDrawdown >= this.maxDrawdownLimit) {
        this.logger.error('═══════════════════════════════════════════════════════');
        this.logger.error('   EMERGENCY STOP TRIGGERED - MAX DRAWDOWN EXCEEDED   ');
        this.logger.error('═══════════════════════════════════════════════════════');
        this.logger.error(`Current Drawdown: ${(currentDrawdown * 100).toFixed(2)}%`);
        this.logger.error(`Max Allowed: ${(this.maxDrawdownLimit * 100).toFixed(2)}%`);
        this.logger.error('');
        this.logger.error('REAL ACCOUNT BALANCE:');
        this.logger.error(`  Initial Balance: $${this.initialRealBalance.toFixed(2)}`);
        this.logger.error(`  Current USDT: $${currentUsdtBalance.toFixed(2)}`);
        this.logger.error(`  Current BTC: ${btcBalance.toFixed(8)} BTC`);
        this.logger.error(`  Total Account Value: $${totalAccountValue.toFixed(2)}`);
        this.logger.error(`  Loss: $${loss.toFixed(2)}`);
        this.logger.error('');
        this.logger.error('ALLOCATED BUDGET (for reference):');
        this.logger.error(`  Initial Allocated: $${this.initialBudget.toFixed(2)}`);
        this.logger.error(`  Current Allocated: $${this.currentBudget.toFixed(2)}`);
        this.logger.error('═══════════════════════════════════════════════════════');

      // Trigger emergency stop
      this.emergencyStopTriggered = true;
      this.isRunning = false;

      // Close all open positions immediately
      if (this.positions.length > 0) {
        this.logger.error('Closing all positions immediately...');
        try {
          const currentPrice = await this.getCurrentPrice();
          for (const position of this.positions) {
            await this.executeClose(currentPrice, 'Emergency stop - max drawdown');
          }
          this.logger.error('All positions closed');
        } catch (error: any) {
          this.logger.error(`Error closing positions during emergency stop: ${error.message}`);
        }
      }

      this.logger.error('═══════════════════════════════════════════════════════');
      this.logger.error('   TRADING STOPPED - MANUAL INTERVENTION REQUIRED    ');
      this.logger.error('═══════════════════════════════════════════════════════');

        return true;
      }

      // Log current status every check (for monitoring)
      this.logger.debug(`Drawdown check: ${(currentDrawdown * 100).toFixed(2)}% (limit: ${(this.maxDrawdownLimit * 100).toFixed(2)}%)`);
      this.logger.debug(`Total account value: $${totalAccountValue.toFixed(2)}`);

      return false;
    } catch (error: any) {
      this.logger.error(`Error checking drawdown limit: ${error.message}`);
      // Don't throw - continue operating but log the error
      return false;
    }
  }

  /**
   * SAFETY: Verify connection health before critical operations
   */
  private async checkConnectionHealth(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastConnectionCheck;

    // Check connection every 60 seconds
    if (timeSinceLastCheck > 60000 || !this.connectionHealthy) {
      try {
        await this.exchange.fetchTime();
        this.connectionHealthy = true;
        this.lastConnectionCheck = now;
        this.logger.debug('Connection health check: OK');
      } catch (error: any) {
        this.connectionHealthy = false;
        this.logger.error(`Connection health check FAILED: ${error.message}`);
        throw new Error('Exchange connection unhealthy');
      }
    }
  }

  /**
   * SAFETY: Periodic balance verification to detect discrepancies
   * FIXED: Now updates real balance tracking
   */
  private async verifyBalanceIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastBalanceCheck;

    if (timeSinceLastCheck > this.balanceCheckInterval) {
      try {
        const balance = await this.exchange.fetchBalance();
        const actualBalance = balance.USDT?.free || 0;

        // Detect multi-bot mode
        const isMultiBotMode = this.initialBudget < actualBalance * 0.5;

        if (isMultiBotMode) {
          // MULTI-BOT MODE: Skip balance verification
          // Each bot tracks its own isolated balance through trade P&L
          // Cannot verify against total exchange balance
          this.logger.debug(`Multi-bot mode: Bot balance $${this.currentRealBalance.toFixed(2)}, Exchange total $${actualBalance.toFixed(2)}`);
          this.lastBalanceCheck = now;
          return;
        }

        // SINGLE-BOT MODE: Verify balance matches exchange
        const discrepancy = Math.abs(actualBalance - this.expectedBalance);
        const discrepancyPercent = (discrepancy / this.expectedBalance) * 100;

        // Update current real balance
        this.currentRealBalance = actualBalance;

        if (discrepancy > 1) {
          this.logger.warn('═══════════════════════════════════════');
          this.logger.warn('   BALANCE DISCREPANCY DETECTED        ');
          this.logger.warn('═══════════════════════════════════════');
          this.logger.warn(`Expected: $${this.expectedBalance.toFixed(2)}`);
          this.logger.warn(`Actual: $${actualBalance.toFixed(2)}`);
          this.logger.warn(`Discrepancy: $${discrepancy.toFixed(2)} (${discrepancyPercent.toFixed(2)}%)`);
          this.logger.warn('═══════════════════════════════════════');

          // Update expected balance to actual
          this.expectedBalance = actualBalance;
        } else {
          this.logger.debug(`Balance verification OK: $${actualBalance.toFixed(2)}`);
        }

        this.lastBalanceCheck = now;
      } catch (error: any) {
        this.logger.error(`Balance verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Execute a buy order with fill verification and slippage monitoring
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
      this.logger.info(`Placing BUY order: ${roundedAmount} BTC at market price ~$${currentPrice.toFixed(2)}`);
      const order = await this.exchange.createMarketBuyOrder(this.symbol, parseFloat(roundedAmount));

      // SAFETY: Verify order was filled
      let actualFillPrice = currentPrice;
      let actualFillAmount = parseFloat(roundedAmount);

      if (order.status === 'closed' || order.filled > 0) {
        actualFillPrice = order.average || order.price || currentPrice;
        actualFillAmount = order.filled || parseFloat(roundedAmount);

        // SAFETY: Calculate and monitor slippage
        const slippage = Math.abs(actualFillPrice - currentPrice) / currentPrice;
        const slippagePercent = slippage * 100;

        this.slippageHistory.push(slippage);
        if (this.slippageHistory.length > 100) {
          this.slippageHistory.shift(); // Keep only last 100 trades
        }

        if (slippagePercent > 0.1) {
          this.logger.warn('═══════════════════════════════════════');
          this.logger.warn('   HIGH SLIPPAGE DETECTED              ');
          this.logger.warn('═══════════════════════════════════════');
          this.logger.warn(`Expected Price: $${currentPrice.toFixed(2)}`);
          this.logger.warn(`Actual Fill Price: $${actualFillPrice.toFixed(2)}`);
          this.logger.warn(`Slippage: ${slippagePercent.toFixed(4)}%`);
          this.logger.warn('═══════════════════════════════════════');
        } else {
          this.logger.debug(`Slippage: ${slippagePercent.toFixed(4)}%`);
        }

        this.logger.trade(
          `BUY FILLED: ${actualFillAmount.toFixed(8)} BTC @ $${actualFillPrice.toFixed(2)} | ` +
          `Value: $${(actualFillAmount * actualFillPrice).toFixed(2)} | ` +
          `Slippage: ${slippagePercent.toFixed(4)}% | ` +
          `Order ID: ${order.id}`
        );
      } else {
        // Order not filled immediately - this shouldn't happen with market orders
        this.logger.error('═══════════════════════════════════════');
        this.logger.error('   ORDER NOT FILLED IMMEDIATELY        ');
        this.logger.error('═══════════════════════════════════════');
        this.logger.error(`Order ID: ${order.id}`);
        this.logger.error(`Status: ${order.status}`);
        this.logger.error(`Filled: ${order.filled}`);
        this.logger.error('═══════════════════════════════════════');

        // Wait and check order status
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedOrder = await this.exchange.fetchOrder(order.id, this.symbol);

        if (updatedOrder.status === 'closed' && updatedOrder.filled > 0) {
          actualFillPrice = updatedOrder.average || updatedOrder.price || currentPrice;
          actualFillAmount = updatedOrder.filled;
          this.logger.info(`Order filled after delay: ${actualFillAmount.toFixed(8)} BTC @ $${actualFillPrice.toFixed(2)}`);
        } else {
          this.logger.error('Order still not filled - aborting position creation');
          return;
        }
      }

      // Create position with actual fill data
      const position: Position = {
        symbol: this.symbol,
        side: 'long',
        entryPrice: actualFillPrice,
        amount: actualFillAmount,
        currentPrice: actualFillPrice,
        unrealizedPnL: 0,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        timestamp: Date.now(),
        actualFillPrice,
        expectedPrice: currentPrice,
        slippage: Math.abs(actualFillPrice - currentPrice) / currentPrice,
      };

      this.positions.push(position);
      const actualPositionValue = actualFillAmount * actualFillPrice;

      // CRITICAL FIX: Deduct entry fee from budget
      const entryFeeRate = 0.001; // 0.1% Binance fee
      const entryFee = actualPositionValue * entryFeeRate;

      this.currentBudget -= (actualPositionValue + entryFee);
      this.expectedBalance -= (actualPositionValue + entryFee);

      // CRITICAL: Place exchange-enforced stop loss order if specified
      if (signal.stopLoss) {
        const stopLossOrderId = await this.placeStopLoss(actualFillAmount, signal.stopLoss);
        if (stopLossOrderId) {
          position.stopLossOrderId = stopLossOrderId;
          this.openStopLossOrders.set(`${this.symbol}_${this.positions.length - 1}`, stopLossOrderId);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error executing buy: ${error.message}`);
      if (error.stack) {
        this.logger.debug(`Stack trace: ${error.stack}`);
      }
    }
  }

  /**
   * Execute a close order with fill verification and comprehensive tracking
   */
  private async executeClose(currentPrice: number, reason: string): Promise<void> {
    if (this.positions.length === 0) {
      return;
    }

    try {
      const position = this.positions[0];
      const roundedAmount = this.exchange.amountToPrecision(this.symbol, position.amount);

      // Cancel any existing stop loss orders BEFORE selling
      if (position.stopLossOrderId) {
        try {
          await this.exchange.cancelOrder(position.stopLossOrderId, this.symbol);
          this.logger.info(`Cancelled stop loss order: ${position.stopLossOrderId}`);
          this.openStopLossOrders.delete(`${this.symbol}_0`);
        } catch (cancelError: any) {
          this.logger.warn(`Could not cancel stop loss order ${position.stopLossOrderId}: ${cancelError.message}`);
        }
      }

      // Place market sell order
      this.logger.info(`Placing SELL order: ${roundedAmount} BTC at market price ~$${currentPrice.toFixed(2)}`);
      const order = await this.exchange.createMarketSellOrder(this.symbol, parseFloat(roundedAmount));

      // SAFETY: Verify order was filled
      let actualFillPrice = currentPrice;
      let actualFillAmount = parseFloat(roundedAmount);

      if (order.status === 'closed' || order.filled > 0) {
        actualFillPrice = order.average || order.price || currentPrice;
        actualFillAmount = order.filled || parseFloat(roundedAmount);

        // SAFETY: Calculate slippage on exit
        const exitSlippage = Math.abs(actualFillPrice - currentPrice) / currentPrice;
        const exitSlippagePercent = exitSlippage * 100;

        this.slippageHistory.push(exitSlippage);
        if (this.slippageHistory.length > 100) {
          this.slippageHistory.shift();
        }

        if (exitSlippagePercent > 0.1) {
          this.logger.warn(`Exit slippage: ${exitSlippagePercent.toFixed(4)}%`);
        }
      } else {
        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedOrder = await this.exchange.fetchOrder(order.id, this.symbol);

        if (updatedOrder.status === 'closed' && updatedOrder.filled > 0) {
          actualFillPrice = updatedOrder.average || updatedOrder.price || currentPrice;
          actualFillAmount = updatedOrder.filled;
        } else {
          this.logger.error('SELL order not filled - position may still be open!');
          return;
        }
      }

      const positionValue = actualFillAmount * actualFillPrice;

      // CRITICAL FIX: Deduct trading fees (0.1% per trade = 0.2% round trip)
      // Binance spot trading fees: 0.1% (or 0.075% with BNB discount)
      const feeRate = 0.001; // 0.1% per trade
      const entryFee = (position.amount * position.entryPrice) * feeRate;
      const exitFee = positionValue * feeRate;
      const totalFees = entryFee + exitFee;

      const grossProfit = positionValue - (position.amount * position.entryPrice);
      const profit = grossProfit - totalFees; // Net profit after fees
      const profitPercent = (profit / (position.amount * position.entryPrice)) * 100;

      this.currentBudget += positionValue - exitFee; // Deduct exit fee from budget
      this.expectedBalance += positionValue - exitFee;
      this.currentRealBalance += profit; // Update real balance with profit/loss

      // Record comprehensive trade data
      const tradeRecord: TradeRecord = {
        profit,
        win: profit > 0,
        timestamp: Date.now(),
        entryPrice: position.entryPrice,
        exitPrice: actualFillPrice,
        actualFillPrice,
        expectedPrice: currentPrice,
        slippage: Math.abs(actualFillPrice - currentPrice) / currentPrice,
        amount: actualFillAmount,
        reason,
      };

      this.tradeHistory.push(tradeRecord);

      this.logger.trade(
        `SELL FILLED: ${actualFillAmount.toFixed(8)} BTC @ $${actualFillPrice.toFixed(2)} | ` +
        `Gross: $${grossProfit.toFixed(2)} | Fees: $${totalFees.toFixed(2)} | ` +
        `Net PnL: $${profit.toFixed(2)} (${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%) | ` +
        `Entry: $${position.entryPrice.toFixed(2)} | ` +
        `Reason: ${reason} | Order ID: ${order.id}`
      );

      // Remove position
      this.positions = [];

      // Double-check and cancel any remaining stop loss orders
      const openOrders = await this.exchange.fetchOpenOrders(this.symbol);
      for (const openOrder of openOrders) {
        if (openOrder.type === 'STOP_LOSS_LIMIT' || openOrder.type === 'stop_loss_limit') {
          try {
            await this.exchange.cancelOrder(openOrder.id, this.symbol);
            this.logger.info(`Cancelled remaining stop loss order: ${openOrder.id}`);
          } catch (e) {
            // Ignore if already cancelled
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Error executing close: ${error.message}`);
      if (error.stack) {
        this.logger.debug(`Stack trace: ${error.stack}`);
      }
    }
  }

  /**
   * CRITICAL SAFETY: Place exchange-enforced stop loss order
   * Creates actual STOP_LOSS_LIMIT order on Binance
   * Returns order ID if successful, null if failed
   */
  private async placeStopLoss(amount: number, stopLoss: number): Promise<string | null> {
    try {
      // Binance requires stop-limit orders for spot trading
      const stopPrice = parseFloat(this.exchange.priceToPrecision(this.symbol, stopLoss));
      // Limit price slightly below stop to ensure execution (1% buffer)
      const limitPrice = parseFloat(this.exchange.priceToPrecision(this.symbol, stopLoss * 0.99));
      const roundedAmount = parseFloat(this.exchange.amountToPrecision(this.symbol, amount));

      this.logger.info('═══════════════════════════════════════════════════════');
      this.logger.info('   PLACING EXCHANGE-ENFORCED STOP LOSS ORDER         ');
      this.logger.info('═══════════════════════════════════════════════════════');
      this.logger.info(`Amount: ${roundedAmount.toFixed(8)} BTC`);
      this.logger.info(`Stop Price: $${stopPrice.toFixed(2)}`);
      this.logger.info(`Limit Price: $${limitPrice.toFixed(2)} (1% buffer)`);

      try {
        // Attempt to place stop-loss-limit order
        // For Binance: createOrder(symbol, type, side, amount, price, params)
        const stopLossOrder = await this.exchange.createOrder(
          this.symbol,
          'STOP_LOSS_LIMIT',
          'sell',
          roundedAmount,
          limitPrice,
          {
            stopPrice: stopPrice,
            timeInForce: 'GTC', // Good Till Cancelled
          }
        );

        this.logger.info(`✓ Stop loss order placed successfully`);
        this.logger.info(`Order ID: ${stopLossOrder.id}`);
        this.logger.info(`Status: ${stopLossOrder.status}`);
        this.logger.info('Stop loss is now EXCHANGE-ENFORCED');
        this.logger.info('═══════════════════════════════════════════════════════');

        return stopLossOrder.id;
      } catch (orderError: any) {
        // If stop-loss-limit orders aren't supported, fall back to manual monitoring
        this.logger.warn('═══════════════════════════════════════════════════════');
        this.logger.warn('   STOP LOSS ORDER PLACEMENT FAILED                  ');
        this.logger.warn('═══════════════════════════════════════════════════════');
        this.logger.warn(`Error: ${orderError.message}`);
        this.logger.warn(`Stop Price: $${stopPrice.toFixed(2)}`);
        this.logger.warn('Falling back to MANUAL stop loss monitoring');
        this.logger.warn('⚠️  RISK: Stop loss NOT exchange-enforced!');
        this.logger.warn('⚠️  Manual monitoring active - higher risk!');
        this.logger.warn('═══════════════════════════════════════════════════════');

        return null;
      }
    } catch (error: any) {
      this.logger.error(`Error in placeStopLoss: ${error.message}`);
      this.logger.error('⚠️  CRITICAL: No stop loss protection!');
      return null;
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
   * Get current statistics with safety metrics
   *
   * FIXED: Now uses REAL balance for P&L and drawdown calculations
   */
  public getStats(): BotStats {
    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.win).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Calculate total P&L from trade history
    const totalPnL = this.tradeHistory.reduce((sum, t) => sum + t.profit, 0);

    // Calculate REAL drawdown from real balance (not allocated budget)
    const currentDrawdown = this.initialRealBalance > 0
      ? ((this.initialRealBalance - this.currentRealBalance) / this.initialRealBalance) * 100
      : 0;

    // Calculate average slippage
    const averageSlippage = this.slippageHistory.length > 0
      ? (this.slippageHistory.reduce((sum, s) => sum + s, 0) / this.slippageHistory.length) * 100
      : 0;

    // Calculate balance discrepancy (between our tracking and expected)
    const balanceDiscrepancy = this.expectedBalance > 0
      ? Math.abs(this.currentRealBalance - this.expectedBalance)
      : 0;

    return {
      botName: this.strategy.getName(),
      strategy: this.strategy.getName(),
      isRunning: this.isRunning,
      // Report BOTH allocated budget (for position sizing) and real balance (for P&L)
      initialBudget: this.initialRealBalance, // Use real balance for stats display
      currentBudget: this.currentRealBalance, // Use real balance for stats display
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      openOrders: this.orders.filter(o => o.status === 'open'),
      positions: this.positions,
      totalPnL,
      currentDrawdown,
      averageSlippage,
      emergencyStopTriggered: this.emergencyStopTriggered,
      lastBalanceCheck: this.lastBalanceCheck,
      balanceDiscrepancy,
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
