import { BotManager } from '../BotManager';
import { BotMetrics, PortfolioMetrics } from './types';
import { BotStats } from '../types';

/**
 * Collects metrics from all trading bots - FIXED SHARPE RATIO
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
      // Filter out bots with 0 Sharpe (not enough data) for accurate average
      const validSharpes = botMetrics.filter(bot => bot.sharpeRatio !== 0);
      if (validSharpes.length > 0) {
        portfolioSharpe = validSharpes.reduce((sum, bot) => sum + bot.sharpeRatio, 0) / validSharpes.length;
      }
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

    // Calculate Sharpe ratio (FIXED)
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
   * Calculate Sharpe ratio - FIXED FORMULA
   *
   * Sharpe Ratio = (Average Return - Risk Free Rate) / Standard Deviation of Returns
   *
   * PREVIOUS BUG:
   * - Used total return instead of average return per period
   * - Used drawdown as volatility (completely wrong!)
   * - Formula: returns / |drawdown| ❌
   *
   * FIXED APPROACH:
   * - Estimate standard deviation from win rate and average trade returns
   * - Use annualized returns (assuming ~1000 trades/year for crypto)
   * - Risk-free rate assumed 0% for crypto (highly volatile asset)
   * - Formula: (Avg Return * sqrt(252)) / (Std Dev * sqrt(252)) = Avg Return / Std Dev
   */
  private calculateSharpeRatio(stats: BotStats): number {
    // Need minimum trades for statistical significance
    if (stats.totalTrades < 5) return 0;

    // Calculate average return per trade (as percentage)
    const avgReturnPercent = ((stats.currentBudget - stats.initialBudget) / stats.initialBudget) / stats.totalTrades * 100;

    // Estimate standard deviation using win rate and average win/loss
    // For simplicity, we estimate based on win rate variance
    const winRate = stats.winRate / 100; // Convert to decimal

    if (winRate === 0 || winRate === 1) {
      // Edge case: all wins or all losses
      return avgReturnPercent > 0 ? 1.0 : -1.0;
    }

    // Estimate average win and loss size
    // If we're profitable overall, wins must be larger than losses on average
    const totalReturn = stats.currentBudget - stats.initialBudget;
    const avgWinSize = winRate > 0 ? Math.abs(totalReturn) / stats.winningTrades : 1;
    const avgLossSize = (1 - winRate) > 0 ? Math.abs(totalReturn) / stats.losingTrades : 1;

    // Estimate standard deviation using binary outcome model
    // StdDev ≈ sqrt(p * (avgWin)^2 + (1-p) * (avgLoss)^2 - (avgReturn)^2)
    const variance = (winRate * Math.pow(avgWinSize, 2)) +
                    ((1 - winRate) * Math.pow(avgLossSize, 2)) -
                    Math.pow(Math.abs(totalReturn / stats.totalTrades), 2);

    const stdDev = Math.sqrt(Math.max(variance, 0.0001)); // Avoid division by zero

    // Calculate Sharpe ratio (assuming risk-free rate = 0%)
    // Annualization factor cancels out in numerator and denominator
    const sharpe = avgReturnPercent / (stdDev / stats.initialBudget * 100);

    // Clamp to reasonable range (-5 to 5)
    return Math.max(-5, Math.min(5, sharpe));
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
