/**
 * Comprehensive Backtest Script - Tests ALL strategies
 * Run: npx ts-node scripts/runFullBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { MeanReversionStrategy } from '../src/strategies/MeanReversionStrategy';
import { GridTradingStrategy } from '../src/strategies/GridTradingStrategy';
import { TripleEMAStrategy } from '../src/strategies/TripleEMAStrategy';
import { EMARibbonStrategy } from '../src/strategies/EMARibbonStrategy';
import { SashaHybridOptimizedStrategy } from '../src/strategies/SashaHybridOptimizedStrategy';
import { BaseStrategy } from '../src/strategies/BaseStrategy';

interface StrategyAnalysis {
  name: string;
  results: BacktestResults;
  expectancy: number;
  avgTradePercent: number;
  tradesPerMonth: number;
  monthlyReturn: number;
  isProfitable: boolean;
}

function analyzeResults(results: BacktestResults): StrategyAnalysis {
  const dayCount = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const monthCount = dayCount / 30;

  // Calculate expectancy (average profit per trade in %)
  const avgTradePercent = results.totalTrades > 0
    ? results.totalPnLPercent / results.totalTrades
    : 0;

  // Win rate based expectancy
  const winRate = results.winRate / 100;
  const lossRate = 1 - winRate;
  const expectancy = (winRate * results.avgWinPercent) + (lossRate * results.avgLossPercent);

  // Trades per month
  const tradesPerMonth = results.totalTrades / monthCount;

  // Monthly return estimate
  const monthlyReturn = results.totalPnLPercent / monthCount;

  return {
    name: results.strategyName,
    results,
    expectancy,
    avgTradePercent,
    tradesPerMonth,
    monthlyReturn,
    isProfitable: results.totalPnL > 0
  };
}

function printDetailedResults(analysis: StrategyAnalysis) {
  const r = analysis.results;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`STRATEGY: ${analysis.name}`);
  console.log(`${'='.repeat(70)}`);

  console.log('\n--- PERFORMANCE SUMMARY ---');
  console.log(`  Final Budget:    $${r.finalBudget.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);
  console.log(`  Total PnL:       $${r.totalPnL.toFixed(2)}`);
  console.log(`  Status:          ${analysis.isProfitable ? 'PROFITABLE' : 'LOSING MONEY'}`);

  console.log('\n--- TRADE STATISTICS ---');
  console.log(`  Total Trades:    ${r.totalTrades}`);
  console.log(`  Winning Trades:  ${r.winningTrades} (${r.winRate.toFixed(1)}%)`);
  console.log(`  Losing Trades:   ${r.losingTrades} (${(100 - r.winRate).toFixed(1)}%)`);
  console.log(`  Profit Factor:   ${r.profitFactor.toFixed(2)}`);

  console.log('\n--- RISK METRICS ---');
  console.log(`  Max Drawdown:    $${r.maxDrawdown.toFixed(2)} (${r.maxDrawdownPercent.toFixed(1)}%)`);
  console.log(`  Largest Win:     $${r.largestWin.toFixed(2)}`);
  console.log(`  Largest Loss:    $${r.largestLoss.toFixed(2)}`);
  console.log(`  Avg Win:         ${r.avgWinPercent.toFixed(2)}%`);
  console.log(`  Avg Loss:        ${r.avgLossPercent.toFixed(2)}%`);

  console.log('\n--- TRADE QUALITY ---');
  console.log(`  Avg Trade:       ${analysis.avgTradePercent.toFixed(3)}% per trade`);
  console.log(`  Expectancy:      ${analysis.expectancy.toFixed(3)}% (WR*AvgWin + LR*AvgLoss)`);
  console.log(`  Trades/Month:    ${analysis.tradesPerMonth.toFixed(1)}`);
  console.log(`  Monthly Return:  ${analysis.monthlyReturn.toFixed(2)}%`);
  console.log(`  Avg Holding:     ${r.avgHoldingPeriod.toFixed(0)} minutes`);

  // R:R Analysis
  if (r.avgLossPercent !== 0) {
    const rrRatio = Math.abs(r.avgWinPercent / r.avgLossPercent);
    console.log(`  R:R Ratio:       1:${rrRatio.toFixed(2)}`);
  }

  // Breakeven analysis
  const costPerTrade = 0.35; // 0.35% per round-trip
  const minWinRateNeeded = costPerTrade / (Math.abs(r.avgWinPercent - r.avgLossPercent) + costPerTrade) * 100;
  console.log(`\n--- COST ANALYSIS (0.35% per trade) ---`);
  console.log(`  Cost per Trade:  -0.35%`);
  console.log(`  Min Win Rate:    ${minWinRateNeeded.toFixed(1)}% needed to break even`);
  console.log(`  Current Win Rate: ${r.winRate.toFixed(1)}% (${r.winRate >= minWinRateNeeded ? 'OK' : 'TOO LOW'})`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('COMPREHENSIVE STRATEGY BACKTEST');
  console.log('BTC/USDT with Realistic Fees (0.075% + 0.1% slippage per trade)');
  console.log('='.repeat(70));

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new MeanReversionStrategy(),
    new GridTradingStrategy(),
    new TripleEMAStrategy(),
    new EMARibbonStrategy(),
    new SashaHybridOptimizedStrategy()
  ];

  const analyses: StrategyAnalysis[] = [];

  for (const strategy of strategies) {
    console.log(`\n[Testing] ${strategy.getName()}...`);
    const results = await engine.runBacktest(strategy, 1000);
    const analysis = analyzeResults(results);
    analyses.push(analysis);
    printDetailedResults(analysis);
  }

  // Summary comparison
  console.log('\n' + '='.repeat(70));
  console.log('STRATEGY COMPARISON SUMMARY');
  console.log('='.repeat(70));
  console.log('\n%-25s %8s %8s %8s %10s %8s', 'Strategy', 'PnL %', 'WinRate', 'PF', 'Monthly', 'Status');
  console.log('-'.repeat(70));

  analyses
    .sort((a, b) => b.results.totalPnLPercent - a.results.totalPnLPercent)
    .forEach(a => {
      const status = a.isProfitable ? 'PROFIT' : 'LOSS';
      console.log(
        `%-25s %+7.2f%% %7.1f%% %8.2f %+9.2f%% %8s`,
        a.name.substring(0, 24),
        a.results.totalPnLPercent,
        a.results.winRate,
        a.results.profitFactor,
        a.monthlyReturn,
        status
      );
    });

  console.log('\n' + '='.repeat(70));
  console.log('KEY INSIGHTS');
  console.log('='.repeat(70));

  const profitable = analyses.filter(a => a.isProfitable);
  const losing = analyses.filter(a => !a.isProfitable);

  console.log(`\nProfitable strategies: ${profitable.length}/${analyses.length}`);
  if (profitable.length > 0) {
    console.log('  Best performers:');
    profitable.forEach(a => {
      console.log(`    - ${a.name}: +${a.results.totalPnLPercent.toFixed(2)}%`);
    });
  }

  if (losing.length > 0) {
    console.log('\nLosing strategies need optimization:');
    losing.forEach(a => {
      console.log(`    - ${a.name}: ${a.results.totalPnLPercent.toFixed(2)}%`);
      console.log(`      Issue: ${a.results.winRate < 55 ? 'Low win rate' : a.results.profitFactor < 1.5 ? 'Poor R:R ratio' : 'High drawdown'}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(70));
  console.log(`
To be profitable with 0.35% cost per trade, strategies need:
1. Win rate > 60% with 1:2 R:R, OR
2. Win rate > 50% with 1:3+ R:R, OR
3. Higher risk:reward to overcome costs

Key optimizations needed:
- Reduce trade frequency (fewer trades = fewer fees)
- Increase take profit targets (minimum 1:3 R:R)
- Better entry filters to improve win rate
- Wider stop losses with correspondingly higher targets
`);
}

main().catch(console.error);
