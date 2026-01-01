import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { BotManager } from './BotManager';
import { PerformanceMonitor } from './monitoring/PerformanceMonitor';
import { BacktestingEngine } from './services/BacktestingEngine';
import { MeanReversionStrategy } from './strategies/MeanReversionStrategy';
import { SashaHybridOptimizedStrategy } from './strategies/SashaHybridOptimizedStrategy';
import { GridTradingStrategy } from './strategies/GridTradingStrategy';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Global bot manager and performance monitor instances
let botManager: BotManager | null = null;
let performanceMonitor: PerformanceMonitor | null = null;

/**
 * GET /api/status
 * Get server and bot manager status
 */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    initialized: botManager !== null,
    running: botManager ? botManager.areBotsRunning() : false
  });
});

/**
 * POST /api/initialize
 * Initialize the bot manager
 */
app.post('/api/initialize', async (req, res) => {
  try {
    const { mode, initialBudget, apiKey, apiSecret } = req.body;

    if (!mode || !initialBudget) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: mode, initialBudget'
      });
    }

    if ((mode === 'real' || mode === 'testnet') && (!apiKey || !apiSecret)) {
      return res.status(400).json({
        success: false,
        error: 'API key and secret required for real/testnet trading mode'
      });
    }

    botManager = new BotManager(mode, initialBudget, apiKey, apiSecret);
    await botManager.initialize();

    // Initialize performance monitor
    performanceMonitor = new PerformanceMonitor(botManager, initialBudget);
    performanceMonitor.start();

    res.json({
      success: true,
      message: 'Bot manager and performance monitor initialized',
      bots: botManager.getBotNames()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/start
 * Start all bots
 */
app.post('/api/start', async (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    await botManager.startAll();

    res.json({
      success: true,
      message: 'All bots started'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/stop
 * Stop all bots
 */
app.post('/api/stop', async (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    await botManager.stopAll();

    // Stop performance monitor
    if (performanceMonitor) {
      performanceMonitor.stop();
    }

    res.json({
      success: true,
      message: 'All bots and performance monitor stopped'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bots
 * Get list of all bots
 */
app.get('/api/bots', (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    const bots = botManager.getBotNames();

    res.json({
      success: true,
      bots
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/stats/:botName
 * Get statistics for a specific bot
 */
app.get('/api/stats/:botName', (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    const { botName } = req.params;
    const stats = botManager.getBotStats(botName);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: `Bot not found: ${botName}`
      });
    }

    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/stats
 * Get statistics for all bots
 */
app.get('/api/stats', (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    const allStats = botManager.getAllStats();
    const statsObject: any = {};

    for (const [name, stats] of allStats) {
      statsObject[name] = stats;
    }

    res.json({
      success: true,
      stats: statsObject,
      currentPrice: botManager.getCurrentPrice()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bot/:botName/start
 * Start a specific bot
 */
app.post('/api/bot/:botName/start', async (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    const { botName } = req.params;
    await botManager.startBot(botName);

    res.json({
      success: true,
      message: `Bot ${botName} started`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bot/:botName/stop
 * Stop a specific bot
 */
app.post('/api/bot/:botName/stop', async (req, res) => {
  try {
    if (!botManager) {
      return res.status(400).json({
        success: false,
        error: 'Bot manager not initialized'
      });
    }

    const { botName } = req.params;
    await botManager.stopBot(botName);

    res.json({
      success: true,
      message: `Bot ${botName} stopped`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/snapshot
 * Get current performance snapshot
 */
app.get('/api/monitoring/snapshot', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const snapshot = performanceMonitor.getCurrentSnapshot();

    res.json({
      success: true,
      snapshot
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/leaderboard
 * Get bot performance leaderboard
 */
app.get('/api/monitoring/leaderboard', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const snapshot = performanceMonitor.getCurrentSnapshot();
    const leaderboard = snapshot ? snapshot.rankings : [];

    res.json({
      success: true,
      leaderboard
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/report/daily
 * Generate daily performance report
 */
app.get('/api/monitoring/report/daily', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const report = performanceMonitor.generateDailyReport();

    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/bot/:botName
 * Get detailed bot report
 */
app.get('/api/monitoring/bot/:botName', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const { botName } = req.params;
    const report = performanceMonitor.generateBotReport(botName);

    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/alerts
 * Get current alerts
 */
app.get('/api/monitoring/alerts', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const alerts = performanceMonitor.getAlerts(limit);

    res.json({
      success: true,
      alerts
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/export/csv
 * Export performance data to CSV
 */
app.get('/api/monitoring/export/csv', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const filepath = performanceMonitor.exportToCSV();

    res.json({
      success: true,
      message: 'Data exported to CSV',
      filepath
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/export/json
 * Export performance data to JSON
 */
app.get('/api/monitoring/export/json', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const filepath = performanceMonitor.exportToJSON();

    res.json({
      success: true,
      message: 'Data exported to JSON',
      filepath
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/status
 * Get monitoring system status
 */
app.get('/api/monitoring/status', (req, res) => {
  try {
    if (!performanceMonitor) {
      return res.status(400).json({
        success: false,
        error: 'Performance monitor not initialized'
      });
    }

    const status = performanceMonitor.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/backtest
 * Run backtest for all strategies or a specific strategy
 */
app.post('/api/backtest', async (req, res) => {
  try {
    const { daysBack = 730, initialBudget = 1000, strategy } = req.body;

    console.log(`[API] Starting backtest - Days: ${daysBack}, Budget: $${initialBudget}`);

    const backtestEngine = new BacktestingEngine('BTCUSDT');

    // Fetch historical data
    await backtestEngine.fetchHistoricalData(daysBack);

    const strategies = {
      'MeanReversion': new MeanReversionStrategy(),
      'SashaHybridOptimized': new SashaHybridOptimizedStrategy(),
      'GridTrading': new GridTradingStrategy()
    };

    // If specific strategy requested, only test that one
    if (strategy && strategies[strategy as keyof typeof strategies]) {
      const strategyInstance = strategies[strategy as keyof typeof strategies];
      const results = await backtestEngine.runBacktest(strategyInstance, initialBudget);

      return res.json({
        success: true,
        results: [results]
      });
    }

    // Otherwise, test all strategies
    const results = [];
    for (const [name, strategyInstance] of Object.entries(strategies)) {
      const result = await backtestEngine.runBacktest(strategyInstance, initialBudget);
      results.push(result);
    }

    res.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error('[API] Backtest error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/logs
 * Get list of all log files
 */
app.get('/api/logs', (req, res) => {
  try {
    const logsDir = path.join(__dirname, '../logs');

    if (!fs.existsSync(logsDir)) {
      return res.json({
        success: true,
        logs: []
      });
    }

    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const stats = fs.statSync(path.join(logsDir, file));
        return {
          filename: file,
          size: stats.size,
          modified: stats.mtime,
          botName: file.replace('-fake.log', '').replace('-real.log', '')
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    res.json({
      success: true,
      logs: files
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/logs/:filename
 * Get content of specific log file
 */
app.get('/api/logs/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const lines = req.query.lines ? parseInt(req.query.lines as string) : 100;

    const logsDir = path.join(__dirname, '../logs');
    const filepath = path.join(logsDir, filename);

    // Security check - prevent directory traversal
    if (!filepath.startsWith(logsDir)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'Log file not found'
      });
    }

    // Read last N lines of file
    const content = fs.readFileSync(filepath, 'utf-8');
    const allLines = content.split('\n');
    const lastLines = allLines.slice(-lines);

    res.json({
      success: true,
      filename,
      lines: lastLines.length,
      content: lastLines.join('\n')
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/logs/bot/:botName
 * Get logs for specific bot (auto-detects fake/real mode)
 */
app.get('/api/logs/bot/:botName', (req, res) => {
  try {
    const { botName } = req.params;
    const lines = req.query.lines ? parseInt(req.query.lines as string) : 100;

    const logsDir = path.join(__dirname, '../logs');

    // Try fake mode first, then real mode
    const possibleFiles = [
      `${botName}-fake.log`,
      `${botName}-real.log`,
      `${botName}.log`
    ];

    let filepath = null;
    for (const file of possibleFiles) {
      const testPath = path.join(logsDir, file);
      if (fs.existsSync(testPath)) {
        filepath = testPath;
        break;
      }
    }

    if (!filepath) {
      return res.status(404).json({
        success: false,
        error: `No log file found for bot: ${botName}`
      });
    }

    // Read last N lines
    const content = fs.readFileSync(filepath, 'utf-8');
    const allLines = content.split('\n').filter(line => line.trim());
    const lastLines = allLines.slice(-lines);

    res.json({
      success: true,
      botName,
      filename: path.basename(filepath),
      lines: lastLines.length,
      totalLines: allLines.length,
      content: lastLines.join('\n'),
      logs: lastLines
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/logs/bot/:botName/stream
 * Stream logs in real-time (Server-Sent Events)
 */
app.get('/api/logs/bot/:botName/stream', (req, res) => {
  const { botName } = req.params;

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const logsDir = path.join(__dirname, '../logs');
    const possibleFiles = [
      `${botName}-fake.log`,
      `${botName}-real.log`,
      `${botName}.log`
    ];

    let filepath = null;
    for (const file of possibleFiles) {
      const testPath = path.join(logsDir, file);
      if (fs.existsSync(testPath)) {
        filepath = testPath;
        break;
      }
    }

    if (!filepath) {
      res.write(`data: ${JSON.stringify({ error: 'Log file not found' })}\n\n`);
      res.end();
      return;
    }

    // Send initial content
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim()).slice(-50);
    res.write(`data: ${JSON.stringify({ type: 'initial', lines })}\n\n`);

    // Watch for changes
    let lastSize = fs.statSync(filepath).size;
    const watcher = fs.watch(filepath, (eventType) => {
      if (eventType === 'change') {
        const stats = fs.statSync(filepath);
        if (stats.size > lastSize) {
          const newContent = fs.readFileSync(filepath, 'utf-8');
          const newLines = newContent.split('\n').filter(line => line.trim());
          const recentLines = newLines.slice(-10);
          res.write(`data: ${JSON.stringify({ type: 'update', lines: recentLines })}\n\n`);
          lastSize = stats.size;
        }
      }
    });

    // Cleanup on connection close
    req.on('close', () => {
      watcher.close();
    });

  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * DELETE /api/logs/:filename
 * Delete a specific log file
 */
app.delete('/api/logs/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const logsDir = path.join(__dirname, '../logs');
    const filepath = path.join(logsDir, filename);

    // Security check
    if (!filepath.startsWith(logsDir)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        error: 'Log file not found'
      });
    }

    fs.unlinkSync(filepath);

    res.json({
      success: true,
      message: `Deleted log file: ${filename}`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
