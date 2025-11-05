import { BotMetrics, PortfolioMetrics, PerformanceSnapshot } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Exports performance data to various formats
 */
export class DataExporter {
  private exportDir: string;

  constructor(exportDir: string = './logs/exports') {
    this.exportDir = exportDir;

    // Create export directory if it doesn't exist
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Export to CSV format
   */
  public exportToCSV(botMetrics: BotMetrics[], filename?: string): string {
    const csvFilename = filename || `performance-${this.getTimestamp()}.csv`;
    const filepath = path.join(this.exportDir, csvFilename);

    // CSV Header
    let csv = 'timestamp,bot_name,strategy,pnl,pnl_percent,total_trades,winning_trades,losing_trades,win_rate,profit_factor,sharpe_ratio,max_drawdown,current_drawdown,open_positions,is_running\n';

    // CSV Rows
    botMetrics.forEach(bot => {
      csv += [
        new Date(bot.timestamp).toISOString(),
        bot.botName,
        bot.strategy,
        bot.pnl.toFixed(2),
        bot.pnlPercent.toFixed(2),
        bot.totalTrades,
        bot.winningTrades,
        bot.losingTrades,
        bot.winRate.toFixed(2),
        bot.profitFactor.toFixed(2),
        bot.sharpeRatio.toFixed(2),
        bot.maxDrawdown.toFixed(2),
        bot.currentDrawdown.toFixed(2),
        bot.openPositions,
        bot.isRunning
      ].join(',') + '\n';
    });

    fs.writeFileSync(filepath, csv);
    return filepath;
  }

  /**
   * Export to JSON format
   */
  public exportToJSON(snapshot: PerformanceSnapshot, filename?: string): string {
    const jsonFilename = filename || `performance-${this.getTimestamp()}.json`;
    const filepath = path.join(this.exportDir, jsonFilename);

    const json = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(filepath, json);
    return filepath;
  }

  /**
   * Append to time-series CSV (for historical tracking)
   */
  public appendToTimeSeriesCSV(botMetrics: BotMetrics[], portfolioMetrics: PortfolioMetrics): void {
    const filepath = path.join(this.exportDir, 'timeseries.csv');

    // Check if file exists, if not create with header
    if (!fs.existsSync(filepath)) {
      const header = 'timestamp,portfolio_pnl,portfolio_pnl_percent,portfolio_win_rate,active_bots,total_trades\n';
      fs.writeFileSync(filepath, header);
    }

    // Append data
    const row = [
      new Date().toISOString(),
      portfolioMetrics.totalPnL.toFixed(2),
      portfolioMetrics.totalPnLPercent.toFixed(2),
      portfolioMetrics.combinedWinRate.toFixed(2),
      portfolioMetrics.activeBotsCount,
      portfolioMetrics.totalTrades
    ].join(',') + '\n';

    fs.appendFileSync(filepath, row);
  }

  /**
   * Export bot-specific CSV
   */
  public exportBotCSV(botName: string, metrics: BotMetrics[]): string {
    const csvFilename = `${botName}-${this.getTimestamp()}.csv`;
    const filepath = path.join(this.exportDir, csvFilename);

    let csv = 'timestamp,pnl,pnl_percent,total_trades,win_rate,profit_factor,sharpe_ratio,drawdown\n';

    metrics.forEach(m => {
      csv += [
        new Date(m.timestamp).toISOString(),
        m.pnl.toFixed(2),
        m.pnlPercent.toFixed(2),
        m.totalTrades,
        m.winRate.toFixed(2),
        m.profitFactor.toFixed(2),
        m.sharpeRatio.toFixed(2),
        m.currentDrawdown.toFixed(2)
      ].join(',') + '\n';
    });

    fs.writeFileSync(filepath, csv);
    return filepath;
  }

  /**
   * Export summary report as JSON
   */
  public exportSummaryJSON(
    portfolioMetrics: PortfolioMetrics,
    botMetrics: BotMetrics[],
    rankings: any[]
  ): string {
    const jsonFilename = `summary-${this.getTimestamp()}.json`;
    const filepath = path.join(this.exportDir, jsonFilename);

    const summary = {
      timestamp: new Date().toISOString(),
      portfolio: portfolioMetrics,
      bots: botMetrics.map(b => ({
        name: b.botName,
        pnl: b.pnl,
        pnlPercent: b.pnlPercent,
        winRate: b.winRate,
        trades: b.totalTrades
      })),
      rankings: rankings.slice(0, 10)
    };

    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
    return filepath;
  }

  /**
   * Get timestamp string for filenames
   */
  private getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  }

  /**
   * Get date string
   */
  private getDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Clean up old export files (keep last N days)
   */
  public cleanupOldExports(daysToKeep: number = 30): number {
    const files = fs.readdirSync(this.exportDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    files.forEach(file => {
      const filepath = path.join(this.exportDir, file);
      const stats = fs.statSync(filepath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });

    return deletedCount;
  }
}
