/**
 * Backtest Script for PROFITABLE Strategies
 * Run: npx ts-node scripts/runProfitableBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { ProfitableMeanReversionStrategy } from '../src/strategies/ProfitableMeanReversionStrategy';
import { ProfitableTrendStrategy } from '../src/strategies/ProfitableTrendStrategy';
import { ProfitableBreakoutStrategy } from '../src/strategies/ProfitableBreakoutStrategy';
import { ProfitableSwingStrategy } from '../src/strategies/ProfitableSwingStrategy';
import { BaseStrategy } from '../src/strategies/BaseStrategy';

interface StrategyAnalysis {
  name: string;
  results: BacktestResults;
  expectancy: number;
  avgTradePercent: number;
  tradesPerMonth: number;
  monthlyReturn: number;
  isProfitable: boolean;
  dailyReturn: number;
  annualReturn: number;
}

function analyzeResults(results: BacktestResults): StrategyAnalysis {
  const dayCount = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const monthCount = dayCount / 30;

  // Calculate expectancy
  const avgTradePercent = results.totalTrades > 0
    ? results.totalPnLPercent / results.totalTrades
    : 0;

  const winRate = results.winRate / 100;
  const lossRate = 1 - winRate;
  const expectancy = (winRate * results.avgWinPercent) + (lossRate * results.avgLossPercent);

  // Trades per month
  const tradesPerMonth = results.totalTrades / monthCount;

  // Returns
  const monthlyReturn = results.totalPnLPercent / monthCount;
  const dailyReturn = results.totalPnLPercent / dayCount;
  const annualReturn = monthlyReturn * 12;

  return {
    name: results.strategyName,
    results,
    expectancy,
    avgTradePercent,
    tradesPerMonth,
    monthlyReturn,
    dailyReturn,
    annualReturn,
    isProfitable: results.totalPnL > 0
  };
}

function printDetailedResults(analysis: StrategyAnalysis) {
  const r = analysis.results;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`STRATEGY: ${analysis.name}`);
  console.log(`${'='.repeat(70)}`);

  const statusIcon = analysis.isProfitable ? '[PROFITABLE]' : '[LOSING]';
  console.log(`\n${statusIcon}`);

  console.log('\n--- PERFORMANCE SUMMARY ---');
  console.log(`  Initial:         $1,000.00`);
  console.log(`  Final:           $${r.finalBudget.toFixed(2)}`);
  console.log(`  Total PnL:       $${r.totalPnL.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);

  console.log('\n--- PROJECTED RETURNS ---');
  console.log(`  Daily Return:    ${analysis.dailyReturn >= 0 ? '+' : ''}${analysis.dailyReturn.toFixed(3)}%`);
  console.log(`  Monthly Return:  ${analysis.monthlyReturn >= 0 ? '+' : ''}${analysis.monthlyReturn.toFixed(2)}%`);
  console.log(`  Annual Return:   ${analysis.annualReturn >= 0 ? '+' : ''}${analysis.annualReturn.toFixed(2)}%`);

  console.log('\n--- TRADE STATISTICS ---');
  console.log(`  Total Trades:    ${r.totalTrades} over 2 years`);
  console.log(`  Trades/Month:    ${analysis.tradesPerMonth.toFixed(1)}`);
  console.log(`  Winning:         ${r.winningTrades} (${r.winRate.toFixed(1)}%)`);
  console.log(`  Losing:          ${r.losingTrades} (${(100 - r.winRate).toFixed(1)}%)`);
  console.log(`  Profit Factor:   ${r.profitFactor.toFixed(2)}`);

  console.log('\n--- RISK METRICS ---');
  console.log(`  Max Drawdown:    $${r.maxDrawdown.toFixed(2)} (${r.maxDrawdownPercent.toFixed(1)}%)`);
  console.log(`  Largest Win:     $${r.largestWin.toFixed(2)}`);
  console.log(`  Largest Loss:    $${r.largestLoss.toFixed(2)}`);
  console.log(`  Avg Win:         +${r.avgWinPercent.toFixed(2)}%`);
  console.log(`  Avg Loss:        ${r.avgLossPercent.toFixed(2)}%`);
  console.log(`  Avg Holding:     ${(r.avgHoldingPeriod / 60).toFixed(1)} hours`);

  // R:R Analysis
  if (r.avgLossPercent !== 0) {
    const rrRatio = Math.abs(r.avgWinPercent / r.avgLossPercent);
    console.log(`  Actual R:R:      1:${rrRatio.toFixed(2)}`);
  }

  // Trade quality
  console.log('\n--- TRADE QUALITY ---');
  console.log(`  Avg Trade:       ${analysis.avgTradePercent >= 0 ? '+' : ''}${analysis.avgTradePercent.toFixed(3)}% per trade`);
  console.log(`  Expectancy:      ${analysis.expectancy >= 0 ? '+' : ''}${analysis.expectancy.toFixed(3)}%`);

  // Cost impact
  const costPerTrade = 0.35;
  const totalFees = r.totalTrades * costPerTrade * 0.15 / 100 * 1000; // Approx fees paid
  console.log(`  Est. Fees Paid:  ~$${totalFees.toFixed(2)} (${r.totalTrades} trades x ~$${(costPerTrade * 0.15 / 100 * 1000).toFixed(2)})`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('PROFITABLE STRATEGY BACKTEST');
  console.log('BTC/USDT with Realistic Fees (0.35% round-trip cost)');
  console.log('='.repeat(70));

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new ProfitableMeanReversionStrategy(),
    new ProfitableTrendStrategy(),
    new ProfitableBreakoutStrategy(),
    new ProfitableSwingStrategy()
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
  console.log('STRATEGY COMPARISON');
  console.log('='.repeat(70));

  console.log('\n| Strategy                  | Total PnL | Win Rate | PF   | Monthly  | Annual   | Status     |');
  console.log('|---------------------------|-----------|----------|------|----------|----------|------------|');

  analyses
    .sort((a, b) => b.results.totalPnLPercent - a.results.totalPnLPercent)
    .forEach(a => {
      const status = a.isProfitable ? 'PROFITABLE' : 'LOSING';
      const pnl = `${a.results.totalPnLPercent >= 0 ? '+' : ''}${a.results.totalPnLPercent.toFixed(1)}%`.padStart(9);
      const wr = `${a.results.winRate.toFixed(1)}%`.padStart(8);
      const pf = a.results.profitFactor.toFixed(2).padStart(4);
      const monthly = `${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(2)}%`.padStart(8);
      const annual = `${a.annualReturn >= 0 ? '+' : ''}${a.annualReturn.toFixed(1)}%`.padStart(8);

      console.log(
        `| ${a.name.substring(0, 25).padEnd(25)} | ${pnl} | ${wr} | ${pf} | ${monthly} | ${annual} | ${status.padEnd(10)} |`
      );
    });

  // Final summary
  const profitable = analyses.filter(a => a.isProfitable);
  const totalProfit = analyses.reduce((sum, a) => sum + a.results.totalPnL, 0);

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nProfitable Strategies: ${profitable.length}/${analyses.length}`);

  if (profitable.length > 0) {
    console.log('\nBest performers:');
    profitable
      .sort((a, b) => b.results.totalPnLPercent - a.results.totalPnLPercent)
      .forEach(a => {
        console.log(`  - ${a.name}: +${a.results.totalPnLPercent.toFixed(2)}% total, +${a.monthlyReturn.toFixed(2)}%/month`);
      });
  }

  const losing = analyses.filter(a => !a.isProfitable);
  if (losing.length > 0) {
    console.log('\nStrategies needing optimization:');
    losing.forEach(a => {
      console.log(`  - ${a.name}: ${a.results.totalPnLPercent.toFixed(2)}%`);
      if (a.results.winRate < 50) {
        console.log(`    -> Issue: Low win rate (${a.results.winRate.toFixed(1)}%)`);
      }
      if (a.results.profitFactor < 1.0) {
        console.log(`    -> Issue: Poor R:R ratio (PF ${a.results.profitFactor.toFixed(2)})`);
      }
    });
  }

  // Combined portfolio analysis
  if (profitable.length >= 2) {
    console.log('\n--- PORTFOLIO APPROACH ---');
    console.log('Running multiple strategies diversifies risk:');

    const avgMonthly = profitable.reduce((sum, a) => sum + a.monthlyReturn, 0) / profitable.length;
    const avgAnnual = avgMonthly * 12;
    const avgDrawdown = profitable.reduce((sum, a) => sum + a.results.maxDrawdownPercent, 0) / profitable.length;

    console.log(`  Average Monthly Return: +${avgMonthly.toFixed(2)}%`);
    console.log(`  Average Annual Return:  +${avgAnnual.toFixed(1)}%`);
    console.log(`  Average Max Drawdown:   ${avgDrawdown.toFixed(1)}%`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log(`
1. Paper trade the profitable strategies for 3+ months
2. Start with 10% of capital on the best performer
3. Scale up gradually if results match backtest
4. Monitor daily and adjust if market conditions change

IMPORTANT: This is educational analysis, not financial advice.
Past performance does not guarantee future results.
`);
}

main().catch(console.error);
