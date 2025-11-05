import { BotManager } from '../BotManager';
import { MetricsCollector } from './MetricsCollector';
import { AnalysisEngine } from './AnalysisEngine';
import { AlertManager } from './AlertManager';
import { ReportGenerator } from './ReportGenerator';
import { DataExporter } from './DataExporter';
import { PerformanceSnapshot, AlertConfig, BotMetrics, PortfolioMetrics } from './types';

/**
 * Main Performance Monitoring Engine
 *
 * Coordinates all monitoring subsystems:
 * - Collects metrics from bots
 * - Analyzes performance
 * - Generates alerts
 * - Creates reports
 * - Exports data
 */
export class PerformanceMonitor {
  private botManager: BotManager;
  private metricsCollector: MetricsCollector;
  private analysisEngine: AnalysisEngine;
  private alertManager: AlertManager;
  private reportGenerator: ReportGenerator;
  private dataExporter: DataExporter;

  private updateInterval: NodeJS.Timeout | null = null;
  private updateFrequency: number = 10000; // 10 seconds
  private isRunning: boolean = false;

  private currentSnapshot: PerformanceSnapshot | null = null;
  private snapshotHistory: PerformanceSnapshot[] = [];
  private maxHistorySize: number = 1000;

  private initialCapital: number;
  private startTime: number;

  constructor(
    botManager: BotManager,
    initialCapital: number,
    alertConfig?: Partial<AlertConfig>
  ) {
    this.botManager = botManager;
    this.initialCapital = initialCapital;
    this.startTime = Date.now();

    // Initialize subsystems
    this.metricsCollector = new MetricsCollector(botManager, initialCapital);
    this.analysisEngine = new AnalysisEngine();

    const defaultAlertConfig: AlertConfig = {
      maxDrawdown: 15,
      maxConsecutiveLosses: 5,
      minWinRate: 45,
      maxSlippage: 0.5,
      portfolioMaxDrawdown: 12
    };
    this.alertManager = new AlertManager({ ...defaultAlertConfig, ...alertConfig });

    this.reportGenerator = new ReportGenerator(this.analysisEngine);
    this.dataExporter = new DataExporter();
  }

  /**
   * Start the performance monitor
   */
  public start(): void {
    if (this.isRunning) {
      console.log('[PerformanceMonitor] Already running');
      return;
    }

    console.log('[PerformanceMonitor] Starting...');
    this.isRunning = true;

    // Initial update
    this.update();

    // Schedule regular updates
    this.updateInterval = setInterval(() => {
      this.update();
    }, this.updateFrequency);

    console.log(`[PerformanceMonitor] Running (updates every ${this.updateFrequency/1000}s)`);
  }

  /**
   * Stop the performance monitor
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[PerformanceMonitor] Stopping...');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.isRunning = false;
    console.log('[PerformanceMonitor] Stopped');
  }

  /**
   * Main update cycle
   */
  private update(): void {
    try {
      // Collect metrics
      const botMetrics = this.metricsCollector.collectAllMetrics();
      const portfolioMetrics = this.metricsCollector.collectPortfolioMetrics(botMetrics);

      // Analyze
      const rankings = this.analysisEngine.generateRankings(botMetrics);
      const marketCondition = this.analysisEngine.analyzeMarketConditions(
        this.botManager.getCurrentPrice()
      );

      // Check alerts
      const alerts = this.alertManager.checkAlerts(botMetrics, portfolioMetrics);

      // Generate recommendations
      const recommendations = this.analysisEngine.generateRecommendations(botMetrics, marketCondition);

      // Create snapshot
      const snapshot: PerformanceSnapshot = {
        timestamp: Date.now(),
        portfolio: portfolioMetrics,
        bots: botMetrics,
        market: marketCondition,
        alerts,
        rankings,
        recommendations
      };

      this.currentSnapshot = snapshot;
      this.snapshotHistory.push(snapshot);

      // Trim history if needed
      if (this.snapshotHistory.length > this.maxHistorySize) {
        this.snapshotHistory = this.snapshotHistory.slice(-this.maxHistorySize);
      }

      // Append to time series
      this.dataExporter.appendToTimeSeriesCSV(botMetrics, portfolioMetrics);

      // Display live dashboard in console
      this.displayLiveDashboard();

      // Handle critical alerts
      this.handleCriticalAlerts(alerts);

    } catch (error: any) {
      console.error('[PerformanceMonitor] Update error:', error.message);
    }
  }

  /**
   * Display live dashboard in console
   */
  private displayLiveDashboard(): void {
    if (!this.currentSnapshot) return;

    // Clear console (optional - comment out if you want scrolling history)
    // console.clear();

    const dashboard = this.reportGenerator.generateLiveDashboard(
      this.currentSnapshot.portfolio,
      this.currentSnapshot.bots,
      this.currentSnapshot.rankings,
      this.currentSnapshot.market,
      this.currentSnapshot.alerts
    );

    console.log('\n' + dashboard);
  }

  /**
   * Handle critical alerts (auto-stop bots if needed)
   */
  private handleCriticalAlerts(alerts: any[]): void {
    const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL');

    for (const alert of criticalAlerts) {
      console.log('\n' + this.alertManager.formatAlert(alert));

      // Auto-stop bot if drawdown exceeds limit
      if (alert.metric === 'drawdown' && alert.botName !== 'PORTFOLIO') {
        try {
          console.log(`[PerformanceMonitor] Auto-stopping ${alert.botName} due to excessive drawdown`);
          this.botManager.stopBot(alert.botName);
        } catch (error: any) {
          console.error(`[PerformanceMonitor] Failed to stop ${alert.botName}:`, error.message);
        }
      }

      // Stop all bots if portfolio drawdown exceeds limit
      if (alert.metric === 'portfolioDrawdown') {
        console.log('[PerformanceMonitor] PORTFOLIO DRAWDOWN CRITICAL - STOPPING ALL BOTS');
        try {
          this.botManager.stopAll();
        } catch (error: any) {
          console.error('[PerformanceMonitor] Failed to stop all bots:', error.message);
        }
      }
    }
  }

  /**
   * Generate and save daily report
   */
  public generateDailyReport(): string {
    if (!this.currentSnapshot) {
      return 'No data available for report';
    }

    const report = this.reportGenerator.generateDailySummary(
      this.initialCapital * this.currentSnapshot.bots.length,
      this.currentSnapshot.portfolio,
      this.currentSnapshot.bots,
      this.currentSnapshot.rankings,
      this.currentSnapshot.market
    );

    // Save to file
    const filename = `daily-report-${new Date().toISOString().split('T')[0]}.txt`;
    this.reportGenerator.saveReport(report, filename);

    return report;
  }

  /**
   * Generate leaderboard
   */
  public generateLeaderboard(): string {
    if (!this.currentSnapshot) {
      return 'No data available';
    }

    return this.reportGenerator.generateLeaderboard(this.currentSnapshot.rankings);
  }

  /**
   * Export current performance to CSV
   */
  public exportToCSV(): string {
    if (!this.currentSnapshot) {
      throw new Error('No data to export');
    }

    return this.dataExporter.exportToCSV(this.currentSnapshot.bots);
  }

  /**
   * Export current performance to JSON
   */
  public exportToJSON(): string {
    if (!this.currentSnapshot) {
      throw new Error('No data to export');
    }

    return this.dataExporter.exportToJSON(this.currentSnapshot);
  }

  /**
   * Get current snapshot
   */
  public getCurrentSnapshot(): PerformanceSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Get snapshot history
   */
  public getHistory(limit?: number): PerformanceSnapshot[] {
    if (limit) {
      return this.snapshotHistory.slice(-limit);
    }
    return this.snapshotHistory;
  }

  /**
   * Get specific bot metrics
   */
  public getBotMetrics(botName: string): BotMetrics | null {
    if (!this.currentSnapshot) return null;
    return this.currentSnapshot.bots.find(b => b.botName === botName) || null;
  }

  /**
   * Get portfolio metrics
   */
  public getPortfolioMetrics(): PortfolioMetrics | null {
    return this.currentSnapshot?.portfolio || null;
  }

  /**
   * Get alerts
   */
  public getAlerts(limit?: number): any[] {
    if (!this.currentSnapshot) return [];
    if (limit) {
      return this.currentSnapshot.alerts.slice(-limit);
    }
    return this.currentSnapshot.alerts;
  }

  /**
   * Get uptime in milliseconds
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get uptime formatted
   */
  public getUptimeFormatted(): string {
    const ms = this.getUptime();
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Set update frequency
   */
  public setUpdateFrequency(seconds: number): void {
    this.updateFrequency = seconds * 1000;

    // Restart if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Update alert configuration
   */
  public updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertManager.updateConfig(config);
  }

  /**
   * Generate bot-specific report
   */
  public generateBotReport(botName: string): string {
    const bot = this.getBotMetrics(botName);
    if (!bot) {
      return `Bot '${botName}' not found`;
    }
    return this.reportGenerator.generateBotReport(bot);
  }

  /**
   * Get monitoring status
   */
  public getStatus(): {
    isRunning: boolean;
    uptime: string;
    updateFrequency: number;
    snapshotsCollected: number;
    botsMonitored: number;
  } {
    return {
      isRunning: this.isRunning,
      uptime: this.getUptimeFormatted(),
      updateFrequency: this.updateFrequency / 1000,
      snapshotsCollected: this.snapshotHistory.length,
      botsMonitored: this.currentSnapshot?.bots.length || 0
    };
  }
}
