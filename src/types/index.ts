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
  type: 'limit' | 'market' | 'stop-loss';
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filled: number;
  status: 'open' | 'closed' | 'cancelled' | 'partially_filled';
  timestamp: number;
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
}

export interface MarketData {
  symbol: string;
  price: number;
  timestamp: number;
  candles: Candle[];
}

export type StrategyName = 'GridTrading' | 'MeanReversion' | 'TrendFollowing' | 'Sasha-LiqProviding' | 'Sasha-MMLadder' | 'Sasha-Hybrid';
export type BotMode = 'real' | 'fake' | 'testnet';
