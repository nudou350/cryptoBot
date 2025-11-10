import dotenv from 'dotenv';
import { BotManager } from './BotManager';
import { BotMode } from './types';

// Load environment variables
dotenv.config();

console.log('Crypto Trading Bot System');
console.log('========================');
console.log('Server is starting...');
console.log('Open http://localhost:3001 in your browser to access the dashboard');

// Auto-initialize bot manager if credentials are provided in .env
const tradingMode = (process.env.TRADING_MODE || 'fake') as BotMode;
const initialBudget = parseInt(process.env.INITIAL_BUDGET || '500');
const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;

// Start the server (must be imported after env is loaded)
import './server';

// Auto-initialize if in testnet or real mode with credentials
if ((tradingMode === 'testnet' || tradingMode === 'real') && apiKey && apiSecret) {
  console.log('\n======================');
  console.log('AUTO-INITIALIZATION');
  console.log('======================');
  console.log(`Mode: ${tradingMode.toUpperCase()}`);
  console.log(`Budget: $${initialBudget} per bot`);
  console.log(`Environment: ${tradingMode === 'testnet' ? 'Binance Spot Testnet' : 'Binance Production'}`);
  console.log('\nInitializing bots...\n');

  const botManager = new BotManager(tradingMode, initialBudget, apiKey, apiSecret);

  botManager.initialize()
    .then(() => {
      console.log('\n✓ Bot manager initialized successfully');
      return botManager.startAll();
    })
    .then(() => {
      console.log('✓ All bots started successfully');
      console.log('\nSystem is ready!');
      console.log(`Dashboard: http://localhost:${process.env.PORT || 3001}`);
    })
    .catch((error) => {
      console.error('\n✗ Failed to initialize:', error.message);
      console.log('\nPlease check your credentials and network connection');
      process.exit(1);
    });
} else if (tradingMode === 'fake') {
  console.log('\n======================');
  console.log('DEMO MODE (FAKE TRADING)');
  console.log('======================');
  console.log('Using simulated trading with live market data');
  console.log('No API credentials required');
  console.log('\nTo use real/testnet trading:');
  console.log('1. Set TRADING_MODE=testnet in .env');
  console.log('2. Add BINANCE_API_KEY and BINANCE_API_SECRET');
  console.log(`\nDashboard: http://localhost:${process.env.PORT || 3001}`);
} else {
  console.log('\n⚠ WARNING: Missing API credentials');
  console.log('Please set BINANCE_API_KEY and BINANCE_API_SECRET in .env');
  console.log(`\nDashboard: http://localhost:${process.env.PORT || 3001}`);
}
