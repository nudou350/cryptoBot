import { BotMetrics, BotRanking, MarketCondition } from './types';

/**
 * Analyzes bot performance and generates insights
 */
export class AnalysisEngine {
  /**
   * Generate bot rankings
   */
  public generateRankings(botMetrics: BotMetrics[]): BotRanking[] {
    const rankings: BotRanking[] = botMetrics
      .map(bot => ({
        rank: 0,
        botName: bot.botName,
        pnl: bot.pnl,
        pnlPercent: bot.pnlPercent,
        winRate: bot.winRate,
        totalTrades: bot.totalTrades,
        sharpeRatio: bot.sharpeRatio,
        status: this.determineStatus(bot)
      }))
      .sort((a, b) => b.pnl - a.pnl); // Sort by PnL descending

    // Assign ranks
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
    });

    return rankings;
  }

  /**
   * Determine bot status based on performance
   */
  private determineStatus(bot: BotMetrics): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'STOPPED' {
    if (!bot.isRunning) return 'STOPPED';

    // Excellent: High win rate, positive PnL, good Sharpe
    if (bot.winRate >= 60 && bot.pnlPercent > 10 && bot.sharpeRatio > 2) {
      return 'EXCELLENT';
    }

    // Good: Decent win rate, positive PnL
    if (bot.winRate >= 55 && bot.pnlPercent > 5 && bot.sharpeRatio > 1.5) {
      return 'GOOD';
    }

    // Fair: Around break-even
    if (bot.winRate >= 50 && bot.pnlPercent > -5) {
      return 'FAIR';
    }

    // Poor: Losing money
    return 'POOR';
  }

  /**
   * Analyze market conditions
   */
  public analyzeMarketConditions(currentPrice: number, historicalData?: any): MarketCondition {
    // Simplified market analysis (would need historical data for full analysis)
    // For now, return a default condition
    return {
      regime: 'UNKNOWN',
      adx: 0,
      price: currentPrice,
      priceChange24h: 0,
      volatility: 'MEDIUM'
    };
  }

  /**
   * Identify best performers for current market condition
   */
  public getBestForMarketCondition(
    botMetrics: BotMetrics[],
    marketCondition: MarketCondition
  ): BotMetrics[] {
    // Filter active bots with positive PnL
    const goodPerformers = botMetrics.filter(
      bot => bot.isRunning && bot.pnl > 0 && bot.winRate > 50
    );

    // Sort by PnL descending
    return goodPerformers.sort((a, b) => b.pnl - a.pnl).slice(0, 5);
  }

  /**
   * Identify underperformers
   */
  public getUnderperformers(botMetrics: BotMetrics[]): BotMetrics[] {
    const underperformers = botMetrics.filter(
      bot => bot.isRunning && (bot.pnl < 0 || bot.winRate < 45)
    );

    // Sort by PnL ascending (worst first)
    return underperformers.sort((a, b) => a.pnl - b.pnl).slice(0, 5);
  }

  /**
   * Calculate correlation between two bots
   */
  public calculateCorrelation(bot1: BotMetrics, bot2: BotMetrics): number {
    // Simplified correlation based on strategy similarity
    // In a full implementation, would use historical returns data

    const strategyCorrelation: { [key: string]: string[] } = {
      trend: ['EMACrossover', 'TripleEMA', 'EMARibbon', 'EMAMACD', 'ADXTrend', 'TrendFollowing'],
      meanReversion: ['MeanReversion', 'GridTrading'],
      momentum: ['EMASlopeMomentum', 'VolumeBreakout']
    };

    // Check if both bots are in same category
    for (const [category, strategies] of Object.entries(strategyCorrelation)) {
      const bot1InCategory = strategies.some(s => bot1.botName.includes(s));
      const bot2InCategory = strategies.some(s => bot2.botName.includes(s));

      if (bot1InCategory && bot2InCategory) {
        return 0.75; // High correlation
      }
    }

    return 0.15; // Low correlation
  }

  /**
   * Generate recommendations based on performance
   */
  public generateRecommendations(
    botMetrics: BotMetrics[],
    marketCondition: MarketCondition
  ): string[] {
    const recommendations: string[] = [];

    // Check for high performers
    const topPerformers = botMetrics
      .filter(bot => bot.pnlPercent > 15 && bot.isRunning)
      .sort((a, b) => b.pnlPercent - a.pnlPercent)
      .slice(0, 3);

    if (topPerformers.length > 0) {
      topPerformers.forEach(bot => {
        recommendations.push(
          `✓ Increase ${bot.botName} allocation (${bot.pnlPercent.toFixed(1)}% return)`
        );
      });
    }

    // Check for poor performers
    const poorPerformers = botMetrics.filter(
      bot => bot.pnlPercent < -10 && bot.isRunning
    );

    if (poorPerformers.length > 0) {
      poorPerformers.forEach(bot => {
        recommendations.push(`⚠️  Consider pausing ${bot.botName} (${bot.pnlPercent.toFixed(1)}% loss)`);
      });
    }

    // Check for consecutive losses
    const consecutiveLosers = botMetrics.filter(bot => {
      const recentLosses = bot.totalTrades - bot.winningTrades;
      return recentLosses > 5 && bot.isRunning;
    });

    if (consecutiveLosers.length > 0) {
      consecutiveLosers.forEach(bot => {
        recommendations.push(`⚠️  ${bot.botName} has multiple consecutive losses - review strategy`);
      });
    }

    // Check for inactive bots
    const inactiveBots = botMetrics.filter(
      bot => bot.isRunning && bot.totalTrades === 0 && Date.now() - bot.lastTradeTime > 86400000
    );

    if (inactiveBots.length > 0) {
      recommendations.push(`ℹ️  ${inactiveBots.length} bot(s) inactive for 24+ hours`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✓ All bots performing within expected parameters');
    }

    return recommendations;
  }

  /**
   * Format duration in human-readable format
   */
  public formatDuration(ms: number): string {
    if (ms === 0) return 'N/A';

    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Format timestamp to date string
   */
  public formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  }

  /**
   * Format timestamp to date-time string
   */
  public formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').split('.')[0];
  }
}
