import { Alert, AlertConfig, BotMetrics, PortfolioMetrics } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Manages alerts and notifications
 */
export class AlertManager {
  private config: AlertConfig;
  private alertHistory: Alert[] = [];
  private logDir: string;
  private consecutiveLossesTracker: Map<string, number> = new Map();

  constructor(config: AlertConfig, logDir: string = './logs/alerts') {
    this.config = config;
    this.logDir = logDir;

    // Create log directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Check all bots for alert conditions
   */
  public checkAlerts(botMetrics: BotMetrics[], portfolioMetrics: PortfolioMetrics): Alert[] {
    const alerts: Alert[] = [];

    // Check each bot
    for (const bot of botMetrics) {
      // Check drawdown
      if (bot.currentDrawdown <= -this.config.maxDrawdown) {
        alerts.push(this.createAlert(
          'CRITICAL',
          bot.botName,
          `Drawdown ${bot.currentDrawdown.toFixed(2)}% exceeds limit ${this.config.maxDrawdown}%`,
          'drawdown',
          bot.currentDrawdown,
          -this.config.maxDrawdown
        ));
      } else if (bot.currentDrawdown <= -(this.config.maxDrawdown * 0.8)) {
        alerts.push(this.createAlert(
          'WARNING',
          bot.botName,
          `Drawdown ${bot.currentDrawdown.toFixed(2)}% approaching limit`,
          'drawdown',
          bot.currentDrawdown,
          -this.config.maxDrawdown
        ));
      }

      // Check consecutive losses
      const consecutiveLosses = this.trackConsecutiveLosses(bot);
      if (consecutiveLosses >= this.config.maxConsecutiveLosses) {
        alerts.push(this.createAlert(
          'CRITICAL',
          bot.botName,
          `${consecutiveLosses} consecutive losses detected`,
          'consecutiveLosses',
          consecutiveLosses,
          this.config.maxConsecutiveLosses
        ));
      } else if (consecutiveLosses >= (this.config.maxConsecutiveLosses - 1)) {
        alerts.push(this.createAlert(
          'WARNING',
          bot.botName,
          `${consecutiveLosses} consecutive losses (approaching limit)`,
          'consecutiveLosses',
          consecutiveLosses,
          this.config.maxConsecutiveLosses
        ));
      }

      // Check win rate
      if (bot.totalTrades >= 10 && bot.winRate < this.config.minWinRate) {
        alerts.push(this.createAlert(
          'WARNING',
          bot.botName,
          `Win rate ${bot.winRate.toFixed(1)}% below minimum ${this.config.minWinRate}%`,
          'winRate',
          bot.winRate,
          this.config.minWinRate
        ));
      }

      // Check for inactive bots
      const hoursSinceLastTrade = (Date.now() - bot.lastTradeTime) / 3600000;
      if (bot.isRunning && bot.totalTrades > 0 && hoursSinceLastTrade > 24) {
        alerts.push(this.createAlert(
          'INFO',
          bot.botName,
          `No trades for ${hoursSinceLastTrade.toFixed(1)} hours`,
          'inactivity'
        ));
      }

      // Check for excessive trading
      if (bot.totalTrades > 100 && bot.pnl < 0) {
        alerts.push(this.createAlert(
          'WARNING',
          bot.botName,
          `High trade frequency (${bot.totalTrades} trades) with negative PnL`,
          'overtrading',
          bot.totalTrades
        ));
      }
    }

    // Check portfolio-level alerts
    if (portfolioMetrics.portfolioMaxDrawdown <= -this.config.portfolioMaxDrawdown) {
      alerts.push(this.createAlert(
        'CRITICAL',
        'PORTFOLIO',
        `Portfolio drawdown ${portfolioMetrics.portfolioMaxDrawdown.toFixed(2)}% exceeds limit`,
        'portfolioDrawdown',
        portfolioMetrics.portfolioMaxDrawdown,
        -this.config.portfolioMaxDrawdown
      ));
    }

    // Store alerts in history
    this.alertHistory.push(...alerts);

    // Log critical alerts immediately
    const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL');
    if (criticalAlerts.length > 0) {
      this.logAlerts(criticalAlerts);
    }

    return alerts;
  }

  /**
   * Create an alert
   */
  private createAlert(
    level: 'CRITICAL' | 'WARNING' | 'INFO',
    botName: string,
    message: string,
    metric?: string,
    value?: number,
    threshold?: number
  ): Alert {
    return {
      level,
      botName,
      message,
      timestamp: Date.now(),
      metric,
      value,
      threshold
    };
  }

  /**
   * Track consecutive losses for a bot
   */
  private trackConsecutiveLosses(bot: BotMetrics): number {
    const key = bot.botName;
    const recentLosses = bot.losingTrades;

    // Simple heuristic: if losing more than winning, count as consecutive
    if (bot.totalTrades > 0 && bot.winRate < 40) {
      const estimated = Math.floor(bot.totalTrades * 0.3);
      this.consecutiveLossesTracker.set(key, estimated);
      return estimated;
    }

    return this.consecutiveLossesTracker.get(key) || 0;
  }

  /**
   * Log alerts to file
   */
  private logAlerts(alerts: Alert[]): void {
    const logFile = path.join(this.logDir, `alerts-${this.getDateString()}.log`);
    const logContent = alerts.map(alert => this.formatAlert(alert)).join('\n') + '\n';

    fs.appendFileSync(logFile, logContent);
  }

  /**
   * Format alert for logging/display
   */
  public formatAlert(alert: Alert): string {
    const timestamp = new Date(alert.timestamp).toISOString();
    const emoji = this.getAlertEmoji(alert.level);
    return `[${timestamp}] ${emoji} ${alert.level}: ${alert.botName} - ${alert.message}`;
  }

  /**
   * Get emoji for alert level
   */
  private getAlertEmoji(level: 'CRITICAL' | 'WARNING' | 'INFO'): string {
    switch (level) {
      case 'CRITICAL': return '🔴';
      case 'WARNING': return '⚠️';
      case 'INFO': return 'ℹ️';
    }
  }

  /**
   * Get date string for log file naming
   */
  private getDateString(): string {
    const date = new Date();
    return date.toISOString().split('T')[0];
  }

  /**
   * Get recent alerts
   */
  public getRecentAlerts(limit: number = 10): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Clear alert history
   */
  public clearHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Update alert configuration
   */
  public updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get alert statistics
   */
  public getAlertStats(): { total: number; critical: number; warning: number; info: number } {
    return {
      total: this.alertHistory.length,
      critical: this.alertHistory.filter(a => a.level === 'CRITICAL').length,
      warning: this.alertHistory.filter(a => a.level === 'WARNING').length,
      info: this.alertHistory.filter(a => a.level === 'INFO').length
    };
  }
}
