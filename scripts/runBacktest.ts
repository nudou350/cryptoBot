/**
 * Quick backtest script to verify the backtesting engine
 * Run: npx ts-node scripts/runBacktest.ts
 */

import { BacktestingEngine } from '../src/services/BacktestingEngine';
import { MeanReversionStrategy } from '../src/strategies/MeanReversionStrategy';

async function main() {
  console.log('=== Running Backtest with Realistic Parameters ===\n');

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  console.log('\n--- Testing MeanReversion Strategy ---\n');

  const strategy = new MeanReversionStrategy();
  const results = await engine.runBacktest(strategy, 1000);

  console.log('\n=== BACKTEST RESULTS ===');
  console.log(`Strategy: ${results.strategyName}`);
  console.log(`Period: ${new Date(results.startDate).toISOString().split('T')[0]} to ${new Date(results.endDate).toISOString().split('T')[0]}`);
  console.log(`Initial Budget: $${results.initialBudget.toFixed(2)}`);
  console.log(`Final Budget: $${results.finalBudget.toFixed(2)}`);
  console.log(`Total PnL: $${results.totalPnL.toFixed(2)} (${results.totalPnLPercent.toFixed(2)}%)`);
  console.log(`Total Trades: ${results.totalTrades}`);
  console.log(`Win Rate: ${results.winRate.toFixed(2)}%`);
  console.log(`Profit Factor: ${results.profitFactor.toFixed(2)}`);
  console.log(`Max Drawdown: $${results.maxDrawdown.toFixed(2)} (${results.maxDrawdownPercent.toFixed(2)}%)`);
  console.log(`Avg Holding Period: ${results.avgHoldingPeriod.toFixed(0)} minutes`);

  // Show realistic fee impact note
  console.log('\n=== REALISTIC PARAMETERS APPLIED ===');
  console.log('- Fee Rate: 0.075% per trade (Binance with BNB)');
  console.log('- Slippage: 0.1% per trade');
  console.log('- Position Size: 15% of capital (max 20%)');
  console.log('- Total cost per round-trip: ~0.35%');
}

main().catch(console.error);
