import { BotMetrics, BotRanking, PortfolioMetrics, DailyReport, MarketCondition } from './types';
import { AnalysisEngine } from './AnalysisEngine';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generates performance reports
 */
export class ReportGenerator {
  private analysisEngine: AnalysisEngine;
  private reportDir: string;

  constructor(analysisEngine: AnalysisEngine, reportDir: string = './logs/reports') {
    this.analysisEngine = analysisEngine;
    this.reportDir = reportDir;

    // Create report directory if it doesn't exist
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Generate and display live dashboard
   */
  public generateLiveDashboard(
    portfolioMetrics: PortfolioMetrics,
    botMetrics: BotMetrics[],
    rankings: BotRanking[],
    marketCondition: MarketCondition,
    alerts: any[]
  ): string {
    const topPerformers = rankings.slice(0, 3);
    const currentPrice = marketCondition.price;
    const priceChange = marketCondition.priceChange24h;

    let dashboard = '';
    dashboard += this.createBox([
      '           CRYPTO BOT PERFORMANCE MONITOR',
      `                  Live Update: ${new Date().toLocaleTimeString()}`
    ]);

    dashboard += '\n';
    dashboard += this.createSection('Portfolio Summary', [
      '',
      `  Total PnL: ${this.formatPnL(portfolioMetrics.totalPnL)} (${this.formatPercent(portfolioMetrics.totalPnLPercent)}) ${this.getArrow(portfolioMetrics.totalPnL)}`,
      `  Active Bots: ${portfolioMetrics.activeBotsCount}/${portfolioMetrics.totalBotsCount} (${portfolioMetrics.totalBotsCount - portfolioMetrics.activeBotsCount} paused)`,
      `  Win Rate: ${portfolioMetrics.combinedWinRate.toFixed(1)}% (combined)`,
      `  Open Positions: ${botMetrics.reduce((sum, b) => sum + b.openPositions, 0)}`,
      '',
      `  Market Condition: ${marketCondition.regime}`,
      `  BTC Price: $${currentPrice.toFixed(2)} (${this.getArrow(priceChange)} ${Math.abs(priceChange).toFixed(2)}% 24h)`,
      ''
    ]);

    dashboard += '\n';
    dashboard += this.createSection('Top Performers (24h)', [
      '',
      ...topPerformers.map((p, i) => {
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
        return `  ${emoji} ${p.botName.padEnd(20)} ${this.formatPnL(p.pnl).padStart(12)} (${this.formatPercent(p.pnlPercent)})  [${p.totalTrades} trades]`;
      }),
      ''
    ]);

    if (alerts.length > 0) {
      dashboard += '\n';
      const alertLines = alerts.slice(0, 5).map(a => {
        const emoji = a.level === 'CRITICAL' ? '🔴' : a.level === 'WARNING' ? '⚠️' : 'ℹ️';
        return `  ${emoji} ${a.botName}: ${a.message}`;
      });
      dashboard += this.createSection(`⚠️  Alerts (${alerts.length})`, ['', ...alertLines, '']);
    }

    return dashboard;
  }

  /**
   * Generate daily summary report
   */
  public generateDailySummary(
    startingBalance: number,
    portfolioMetrics: PortfolioMetrics,
    botMetrics: BotMetrics[],
    rankings: BotRanking[],
    marketCondition: MarketCondition
  ): string {
    const best = rankings[0];
    const worst = rankings[rankings.length - 1];
    const totalTrades = botMetrics.reduce((sum, b) => sum + b.totalTrades, 0);
    const recommendations = this.analysisEngine.generateRecommendations(botMetrics, marketCondition);

    let report = '';
    report += this.createDivider('DAILY PERFORMANCE REPORT - ' + new Date().toLocaleDateString());

    report += '\nPortfolio Overview:\n';
    report += `  Starting Balance:  $${startingBalance.toFixed(2)}\n`;
    report += `  Ending Balance:    $${(startingBalance + portfolioMetrics.totalPnL).toFixed(2)}\n`;
    report += `  Net PnL:           ${this.formatPnL(portfolioMetrics.totalPnL)} (${this.formatPercent(portfolioMetrics.totalPnLPercent)})\n`;
    report += `  Best Day So Far:   ${portfolioMetrics.totalPnL > 0 ? 'YES ✓' : 'NO'}\n`;

    report += '\nMarket Conditions:\n';
    report += `  Regime: ${marketCondition.regime}\n`;
    report += `  BTC Change: ${this.formatPercent(marketCondition.priceChange24h)}\n`;
    report += `  Volatility: ${marketCondition.volatility}\n`;

    report += '\nStrategy Performance:\n';
    report += `  Best Strategy:     ${best?.botName || 'N/A'} (${this.formatPnL(best?.pnl || 0)}, ${best?.winRate.toFixed(1) || 0}% win rate)\n`;
    report += `  Worst Strategy:    ${worst?.botName || 'N/A'} (${this.formatPnL(worst?.pnl || 0)}, ${worst?.winRate.toFixed(1) || 0}% win rate)\n`;
    report += `  Most Active:       ${this.getMostActive(botMetrics)}\n`;
    report += `  Least Active:      ${this.getLeastActive(botMetrics)}\n`;

    report += '\nTrades Summary:\n';
    report += `  Total Trades:      ${totalTrades}\n`;
    report += `  Winning Trades:    ${botMetrics.reduce((sum, b) => sum + b.winningTrades, 0)} (${portfolioMetrics.combinedWinRate.toFixed(1)}%)\n`;
    report += `  Losing Trades:     ${botMetrics.reduce((sum, b) => sum + b.losingTrades, 0)} (${(100 - portfolioMetrics.combinedWinRate).toFixed(1)}%)\n`;
    report += `  Profit Factor:     ${this.calculateAvgProfitFactor(botMetrics).toFixed(2)}\n`;

    report += '\nRisk Metrics:\n';
    report += `  Max Drawdown:      ${portfolioMetrics.portfolioMaxDrawdown.toFixed(2)}%\n`;
    report += `  Sharpe Ratio:      ${portfolioMetrics.portfolioSharpe.toFixed(2)}\n`;

    report += '\nRecommendations:\n';
    recommendations.forEach(rec => {
      report += `  ${rec}\n`;
    });

    report += '\n';
    report += this.createDivider('');

    return report;
  }

  /**
   * Generate leaderboard table
   */
  public generateLeaderboard(rankings: BotRanking[]): string {
    let table = '';
    table += this.createDivider('BOT LEADERBOARD');
    table += 'Rank | Bot Name           | PnL         | Win Rate | Trades | Status\n';
    table += '─────┼────────────────────┼─────────────┼──────────┼────────┼─────────────\n';

    rankings.forEach(r => {
      const rank = r.rank.toString().padStart(3);
      const name = r.botName.padEnd(18);
      const pnl = this.formatPnL(r.pnl).padStart(11);
      const winRate = `${r.winRate.toFixed(1)}%`.padStart(8);
      const trades = r.totalTrades.toString().padStart(6);
      const status = this.getStatusEmoji(r.status) + ' ' + r.status;

      table += `  ${rank}  | ${name} | ${pnl} | ${winRate} | ${trades} | ${status}\n`;
    });

    table += this.createDivider('');
    return table;
  }

  /**
   * Generate detailed bot report
   */
  public generateBotReport(bot: BotMetrics): string {
    let report = '';
    report += '\n┌' + '─'.repeat(58) + '┐\n';
    report += '│ Bot: ' + bot.botName.padEnd(51) + '│\n';
    report += '├' + '─'.repeat(58) + '┤\n';
    report += '│ Strategy: ' + bot.strategy.padEnd(46) + '│\n';
    report += '│ Status: ' + (bot.isRunning ? 'ACTIVE ✓' : 'STOPPED ✗').padEnd(48) + '│\n';
    report += '│                                                          │\n';
    report += '│ Performance:                                             │\n';
    report += '│   PnL: ' + this.formatPnL(bot.pnl).padEnd(47) + '│\n';
    report += '│   PnL %: ' + this.formatPercent(bot.pnlPercent).padEnd(45) + '│\n';
    report += ('│   Win Rate: ' + bot.winRate.toFixed(1) + '%').padEnd(59) + '│\n';
    report += ('│   Profit Factor: ' + bot.profitFactor.toFixed(2)).padEnd(59) + '│\n';
    report += ('│   Sharpe Ratio: ' + bot.sharpeRatio.toFixed(2)).padEnd(59) + '│\n';
    report += '│                                                          │\n';
    report += '│ Trades:                                                  │\n';
    report += ('│   Total: ' + bot.totalTrades).padEnd(59) + '│\n';
    report += ('│   Winning: ' + bot.winningTrades).padEnd(59) + '│\n';
    report += ('│   Losing: ' + bot.losingTrades).padEnd(59) + '│\n';
    report += ('│   Open Positions: ' + bot.openPositions).padEnd(59) + '│\n';
    report += '│                                                          │\n';
    report += '│ Risk:                                                    │\n';
    report += ('│   Max Drawdown: ' + bot.maxDrawdown.toFixed(2) + '%').padEnd(59) + '│\n';
    report += ('│   Current Drawdown: ' + bot.currentDrawdown.toFixed(2) + '%').padEnd(59) + '│\n';
    report += '└' + '─'.repeat(58) + '┘\n';

    return report;
  }
  /**
   * Save report to file
   */
  public saveReport(report: string, filename: string): void {
    const filepath = path.join(this.reportDir, filename);
    fs.writeFileSync(filepath, report);
  }

  // ========== Helper Methods ==========

  private createBox(lines: string[]): string {
    const width = 70;
    let box = '╔' + '═'.repeat(width) + '╗\n';
    lines.forEach(line => {
      const padding = width - line.length;
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      box += '║' + ' '.repeat(leftPad) + line + ' '.repeat(rightPad) + '║\n';
    });
    box += '╚' + '═'.repeat(width) + '╝';
    return box;
  }

  private createSection(title: string, lines: string[]): string {
    const width = 70;
    let section = `  ${title}:\n`;
    section += '  ' + '━'.repeat(width - 2) + '\n';
    lines.forEach(line => {
      section += line + '\n';
    });
    return section;
  }

  private createDivider(text: string): string {
    const width = 70;
    if (text) {
      return '\n' + '═'.repeat(width) + '\n' + text.padEnd(width) + '\n' + '═'.repeat(width) + '\n';
    }
    return '═'.repeat(width) + '\n';
  }

  private formatPnL(pnl: number): string {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  }

  private formatPercent(percent: number): string {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  }

  private getArrow(value: number): string {
    return value >= 0 ? '⬆' : '⬇';
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'EXCELLENT': return '⭐⭐⭐';
      case 'GOOD': return '⭐⭐';
      case 'FAIR': return '⭐';
      case 'POOR': return '⚠️';
      case 'STOPPED': return '⛔';
      default: return '';
    }
  }

  private getMostActive(botMetrics: BotMetrics[]): string {
    const mostActive = botMetrics.reduce((max, bot) =>
      bot.totalTrades > max.totalTrades ? bot : max
    , botMetrics[0]);
    return `${mostActive.botName} (${mostActive.totalTrades} trades)`;
  }

  private getLeastActive(botMetrics: BotMetrics[]): string {
    const leastActive = botMetrics
      .filter(b => b.isRunning)
      .reduce((min, bot) =>
        bot.totalTrades < min.totalTrades ? bot : min
      , botMetrics.find(b => b.isRunning) || botMetrics[0]);
    return leastActive ? `${leastActive.botName} (${leastActive.totalTrades} trades)` : 'N/A';
  }

  private calculateAvgProfitFactor(botMetrics: BotMetrics[]): number {
    const avgPF = botMetrics.reduce((sum, bot) => sum + bot.profitFactor, 0) / botMetrics.length;
    return avgPF || 0;
  }
}
