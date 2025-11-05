import { BotManager } from '../BotManager';
import { BotMetrics, PortfolioMetrics } from './types';
import { BotStats } from '../types';

/**
 * Collects metrics from all trading bots
 */
export class MetricsCollector {
  private botManager: BotManager;
  private initialCapital: number;

  constructor(botManager: BotManager, initialCapital: number) {
    this.botManager = botManager;
    this.initialCapital = initialCapital;
  }

  /**
   * Collect metrics from all bots
   */
  public collectAllMetrics(): BotMetrics[] {
    const allStats = this.botManager.getAllStats();
    const metrics: BotMetrics[] = [];

    for (const [botName, stats] of allStats) {
      metrics.push(this.convertStatsToBotMetrics(botName, stats));
    }

    return metrics;
  }

  /**
   * Collect portfolio-level metrics
   */
  public collectPortfolioMetrics(botMetrics: BotMetrics[]): PortfolioMetrics {
    const totalPnL = botMetrics.reduce((sum, bot) => sum + bot.pnl, 0);
    const totalTrades = botMetrics.reduce((sum, bot) => sum + bot.totalTrades, 0);
    const activeBots = botMetrics.filter(bot => bot.isRunning).length;

    // Calculate combined win rate
    const totalWins = botMetrics.reduce((sum, bot) => sum + bot.winningTrades, 0);
    const combinedWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    // Calculate portfolio Sharpe ratio (weighted average)
    const totalCapital = this.initialCapital * botMetrics.length;
    let portfolioSharpe = 0;
    if (botMetrics.length > 0) {
      portfolioSharpe = botMetrics.reduce((sum, bot) => sum + bot.sharpeRatio, 0) / botMetrics.length;
    }

    // Calculate portfolio max drawdown (worst across all bots)
    const portfolioMaxDrawdown = Math.min(...botMetrics.map(bot => bot.maxDrawdown), 0);

    // Calculate capital deployed
    const capitalDeployed = botMetrics
      .filter(bot => bot.isRunning)
      .reduce((sum, bot) => sum + this.initialCapital, 0);

    return {
      timestamp: Date.now(),
      totalPnL,
      totalPnLPercent: (totalPnL / totalCapital) * 100,
      totalTrades,
      combinedWinRate,
      portfolioSharpe,
      portfolioMaxDrawdown,
      activeBotsCount: activeBots,
      totalBotsCount: botMetrics.length,
      capitalDeployed,
      totalCapital
    };
  }

  /**
   * Convert BotStats to BotMetrics format
   */
  private convertStatsToBotMetrics(botName: string, stats: BotStats): BotMetrics {
    const pnl = stats.totalPnL;
    const pnlPercent = ((stats.currentBudget - stats.initialBudget) / stats.initialBudget) * 100;

    // Calculate profit factor
    const profitFactor = this.calculateProfitFactor(stats);

    // Calculate Sharpe ratio (simplified)
    const sharpeRatio = this.calculateSharpeRatio(stats);

    // Calculate average trade duration
    const avgTradeDuration = this.calculateAvgTradeDuration(stats);

    // Find last trade time
    const lastTradeTime = this.getLastTradeTime(stats);

    return {
      botName,
      strategy: stats.strategy,
      timestamp: Date.now(),
      pnl,
      pnlPercent,
      totalTrades: stats.totalTrades,
      winningTrades: stats.winningTrades,
      losingTrades: stats.losingTrades,
      winRate: stats.winRate,
      profitFactor,
      sharpeRatio,
      maxDrawdown: stats.currentDrawdown,
      currentDrawdown: stats.currentDrawdown,
      openPositions: stats.positions.length,
      avgTradeDuration,
      lastTradeTime,
      isRunning: stats.isRunning
    };
  }

  /**
   * Calculate profit factor (gross profit / gross loss)
   */
  private calculateProfitFactor(stats: BotStats): number {
    if (stats.losingTrades === 0) return stats.winningTrades > 0 ? 99 : 0;
    if (stats.winningTrades === 0) return 0;

    // Estimate: assume average win/loss based on total PnL and trades
    const avgWin = stats.totalPnL > 0 ? Math.abs(stats.totalPnL) / stats.winningTrades : 0;
    const avgLoss = stats.totalPnL < 0 ? Math.abs(stats.totalPnL) / stats.losingTrades : 1;

    const grossProfit = avgWin * stats.winningTrades;
    const grossLoss = avgLoss * stats.losingTrades;

    return grossLoss > 0 ? grossProfit / grossLoss : 0;
  }

  /**
   * Calculate Sharpe ratio (simplified version)
   */
  private calculateSharpeRatio(stats: BotStats): number {
    if (stats.totalTrades < 5) return 0;

    const returns = (stats.currentBudget - stats.initialBudget) / stats.initialBudget;
    const volatility = Math.abs(stats.currentDrawdown) / 100;

    if (volatility === 0) return returns > 0 ? 3 : 0;

    return returns / volatility;
  }

  /**
   * Calculate average trade duration
   */
  private calculateAvgTradeDuration(stats: BotStats): number {
    // Estimate based on positions (if we had historical data, we'd calculate actual duration)
    // For now, return a default or estimate
    return stats.totalTrades > 0 ? 21600000 : 0; // Default 6 hours in ms
  }

  /**
   * Get last trade timestamp
   */
  private getLastTradeTime(stats: BotStats): number {
    if (stats.positions.length > 0) {
      return stats.positions[stats.positions.length - 1].timestamp;
    }
    // Return current time instead of 0 to avoid showing massive time difference
    // for bots that have closed all positions or haven't traded yet
    return Date.now();
  }
}
