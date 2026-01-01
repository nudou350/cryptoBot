/**
 * 5x Leverage Backtest - Testing FinalTrend with 5x leverage
 *
 * Uses the real Binance data (2 years) with proper leverage simulation
 * including liquidation risk.
 */

import { BacktestingEngine } from '../src/services/BacktestingEngine';
import { FinalTrendStrategy } from '../src/strategies/FinalTrendStrategy';

async function main() {
  console.log('='.repeat(70));
  console.log('5x LEVERAGE BACKTEST - FinalTrend Strategy');
  console.log('='.repeat(70));
  console.log('\nWARNING: This uses 5x leverage - high risk of liquidation!\n');

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategy = new FinalTrendStrategy();
  const INITIAL_BUDGET = 1000;
  const LEVERAGE = 5;

  console.log(`\nRunning backtest with $${INITIAL_BUDGET} initial capital and ${LEVERAGE}x leverage...\n`);

  const results = await engine.runBacktest(strategy, INITIAL_BUDGET, LEVERAGE);

  console.log('\n' + '='.repeat(70));
  console.log('RESULTS - 5x LEVERAGED BACKTEST');
  console.log('='.repeat(70));

  // Calculate key metrics
  const days = (results.endDate - results.startDate) / (24 * 60 * 60 * 1000);
  const dailyReturn = results.totalPnLPercent / days;
  const monthlyReturn = dailyReturn * 30;
  const annualReturn = dailyReturn * 365;

  console.log(`\n--- Account Performance ---`);
  console.log(`  Initial Capital:    $${INITIAL_BUDGET.toFixed(2)}`);
  console.log(`  Final Capital:      $${results.finalBudget.toFixed(2)}`);
  console.log(`  Total PnL:          $${results.totalPnL.toFixed(2)} (${results.totalPnLPercent >= 0 ? '+' : ''}${results.totalPnLPercent.toFixed(2)}%)`);
  console.log(`  Leverage Used:      ${LEVERAGE}x`);

  console.log(`\n--- Returns Breakdown ---`);
  console.log(`  Daily Return:       ${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(4)}%`);
  console.log(`  Monthly Return:     ${monthlyReturn >= 0 ? '+' : ''}${monthlyReturn.toFixed(2)}%`);
  console.log(`  Annual Return:      ${annualReturn >= 0 ? '+' : ''}${annualReturn.toFixed(1)}%`);

  console.log(`\n--- Trade Statistics ---`);
  console.log(`  Total Trades:       ${results.totalTrades}`);
  console.log(`  Winning Trades:     ${results.winningTrades}`);
  console.log(`  Losing Trades:      ${results.losingTrades}`);
  console.log(`  Win Rate:           ${results.winRate.toFixed(2)}%`);
  console.log(`  Avg Win:            +${results.avgWinPercent.toFixed(2)}%`);
  console.log(`  Avg Loss:           ${results.avgLossPercent.toFixed(2)}%`);
  console.log(`  Largest Win:        $${results.largestWin.toFixed(2)}`);
  console.log(`  Largest Loss:       $${results.largestLoss.toFixed(2)}`);

  console.log(`\n--- Risk Metrics ---`);
  console.log(`  Max Drawdown:       $${results.maxDrawdown.toFixed(2)} (${results.maxDrawdownPercent.toFixed(2)}%)`);
  console.log(`  Profit Factor:      ${results.profitFactor.toFixed(2)}`);
  console.log(`  Avg Holding Period: ${results.avgHoldingPeriod.toFixed(0)} minutes`);

  if (results.liquidated) {
    console.log(`\n--- LIQUIDATION EVENT ---`);
    console.log(`  STATUS:             LIQUIDATED!`);
    console.log(`  Liquidation Time:   ${new Date(results.liquidationTime!).toISOString()}`);
    console.log(`  Liquidation Price:  $${results.liquidationPrice!.toFixed(2)}`);
    console.log(`  WARNING: You would have lost all margin!`);
  } else {
    console.log(`\n--- Liquidation Status ---`);
    console.log(`  STATUS:             NOT LIQUIDATED (Survived!)`);
  }

  // Compare to 0.1% daily target
  console.log(`\n--- Target Comparison ---`);
  console.log(`  Target Daily:       0.1%`);
  console.log(`  Achieved Daily:     ${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(4)}%`);
  const targetMet = dailyReturn >= 0.1;
  console.log(`  Target Met:         ${targetMet ? 'YES!' : 'NO'}`);

  if (!targetMet) {
    const neededLeverage = (0.1 / (results.totalPnLPercent / days / LEVERAGE)).toFixed(1);
    console.log(`  Leverage Needed:    ${neededLeverage}x for 0.1% daily`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log('IMPORTANT DISCLAIMER');
  console.log('-'.repeat(70));
  console.log('- Past performance does NOT guarantee future results');
  console.log('- Leverage trading is EXTREMELY risky');
  console.log('- You can lose MORE than your initial investment');
  console.log('- This is EDUCATIONAL only, NOT financial advice');
  console.log('-'.repeat(70));
}

main().catch(console.error);
