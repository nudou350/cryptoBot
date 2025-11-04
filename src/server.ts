import express from 'express';
import cors from 'cors';
import path from 'path';
import { BotManager } from './BotManager';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Global bot manager instance
let botManager: BotManager | null = null;

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

    if (mode === 'real' && (!apiKey || !apiSecret)) {
      return res.status(400).json({
        success: false,
        error: 'API key and secret required for real trading mode'
      });
    }

    botManager = new BotManager(mode, initialBudget, apiKey, apiSecret);
    await botManager.initialize();

    res.json({
      success: true,
      message: 'Bot manager initialized',
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

    res.json({
      success: true,
      message: 'All bots stopped'
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
