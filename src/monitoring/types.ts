/**
 * Performance Monitoring System Types
 */

export interface BotMetrics {
  botName: string;
  strategy: string;
  timestamp: number;
  pnl: number;
  pnlPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  openPositions: number;
  avgTradeDuration: number; // in milliseconds
  lastTradeTime: number;
  isRunning: boolean;
}

export interface PortfolioMetrics {
  timestamp: number;
  totalPnL: number;
  totalPnLPercent: number;
  totalTrades: number;
  combinedWinRate: number;
  portfolioSharpe: number;
  portfolioMaxDrawdown: number;
  activeBotsCount: number;
  totalBotsCount: number;
  capitalDeployed: number;
  totalCapital: number;
}

export interface MarketCondition {
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';
  adx: number;
  price: number;
  priceChange24h: number;
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Alert {
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  botName: string;
  message: string;
  timestamp: number;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface BotRanking {
  rank: number;
  botName: string;
  pnl: number;
  pnlPercent: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
  status: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'STOPPED';
}

export interface PerformanceSnapshot {
  timestamp: number;
  portfolio: PortfolioMetrics;
  bots: BotMetrics[];
  market: MarketCondition;
  alerts: Alert[];
  rankings: BotRanking[];
  recommendations: string[];
}

export interface DailyReport {
  date: string;
  startingBalance: number;
  endingBalance: number;
  netPnL: number;
  netPnLPercent: number;
  bestStrategy: string;
  worstStrategy: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  recommendations: string[];
}

export interface AlertConfig {
  maxDrawdown: number; // Percentage
  maxConsecutiveLosses: number;
  minWinRate: number; // Percentage
  maxSlippage: number; // Percentage
  portfolioMaxDrawdown: number; // Percentage
}
