export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Order {
  id: string;
  symbol: string;
  type: 'limit' | 'market' | 'stop-loss' | 'stop_loss_limit';
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filled: number;
  status: 'open' | 'closed' | 'cancelled' | 'partially_filled';
  timestamp: number;
  stopPrice?: number;
  stopLossOrderId?: string;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  currentPrice: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
  timestamp: number;
  stopLossOrderId?: string;
  actualFillPrice?: number;
  expectedPrice?: number;
  slippage?: number;
}

export interface TradeSignal {
  action: 'buy' | 'sell' | 'hold' | 'close';
  price: number;
  amount?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason: string;
}

export interface BotStats {
  botName: string;
  strategy: string;
  isRunning: boolean;
  initialBudget: number;
  currentBudget: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  openOrders: Order[];
  positions: Position[];
  totalPnL: number;
  currentDrawdown: number;
  averageSlippage?: number;
  emergencyStopTriggered?: boolean;
  lastBalanceCheck?: number;
  balanceDiscrepancy?: number;
  // NEW: Daily and hourly safety metrics
  dailyLoss?: number;
  dailyLossTriggered?: boolean;
  dailyTradeCount?: number;
  maxTradesPerDay?: number;
  tradesPerDayTriggered?: boolean;
  hourlyPnL?: number;
  consecutiveLosses?: number;
}

export interface TradeRecord {
  profit: number;
  win: boolean;
  timestamp: number;
  entryPrice: number;
  exitPrice: number;
  actualFillPrice: number;
  expectedPrice: number;
  slippage: number;
  amount: number;
  reason: string;
}

export interface MarketData {
  symbol: string;
  price: number;
  timestamp: number;
  candles: Candle[];
}

export type StrategyName = 'GridTrading' | 'MeanReversion' | 'TrendFollowing' | 'Sasha-LiqProviding' | 'Sasha-MMLadder' | 'Sasha-Hybrid';
export type BotMode = 'real' | 'fake' | 'testnet';
