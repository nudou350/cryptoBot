/**
 * Quick Backtest - Testing new strategy approaches
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';

// Import strategies
import { FinalTrendStrategy } from '../src/strategies/FinalTrendStrategy';
import { BigTrendCatcherStrategy } from '../src/strategies/BigTrendCatcherStrategy';
import { HighWinRateStrategy } from '../src/strategies/HighWinRateStrategy';
import { TrendRiderStrategy } from '../src/strategies/TrendRiderStrategy';

interface StrategyResult {
  name: string;
  results: BacktestResults;
  dailyReturn: number;
  monthlyReturn: number;
  annualReturn: number;
}

async function main() {
  console.log('='.repeat(70));
  console.log('STRATEGY COMPARISON BACKTEST');
  console.log('Target: 0.1% daily = 3% monthly = 36% annual');
  console.log('='.repeat(70));

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies = [
    { name: 'FinalTrend (baseline)', strategy: new FinalTrendStrategy() },
    { name: 'BigTrendCatcher', strategy: new BigTrendCatcherStrategy() },
    { name: 'HighWinRate', strategy: new HighWinRateStrategy() },
    { name: 'TrendRider', strategy: new TrendRiderStrategy() },
  ];

  const allResults: StrategyResult[] = [];
  const DAYS = 730;

  for (const { name, strategy } of strategies) {
    console.log(`\n[Testing] ${name}...`);

    try {
      const results = await engine.runBacktest(strategy, 1000);
      const dailyReturn = results.totalPnLPercent / DAYS;
      const monthlyReturn = dailyReturn * 30;
      const annualReturn = dailyReturn * 365;

      allResults.push({
        name,
        results,
        dailyReturn,
        monthlyReturn,
        annualReturn
      });

      // Print detailed results
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${name} ${results.totalPnL >= 0 ? '[PROFITABLE]' : '[LOSING]'}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`\n  RETURNS`);
      console.log(`  Total PnL:       $${results.totalPnL.toFixed(2)} (${results.totalPnLPercent >= 0 ? '+' : ''}${results.totalPnLPercent.toFixed(2)}%)`);
      console.log(`  Daily Return:    ${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(4)}%`);
      console.log(`  Monthly Return:  ${monthlyReturn >= 0 ? '+' : ''}${monthlyReturn.toFixed(2)}%`);
      console.log(`  Annual Return:   ${annualReturn >= 0 ? '+' : ''}${annualReturn.toFixed(1)}%`);
      console.log(`\n  TRADE STATS`);
      console.log(`  Total Trades:    ${results.totalTrades}`);
      console.log(`  Win Rate:        ${results.winRate.toFixed(1)}%`);
      console.log(`  Profit Factor:   ${results.profitFactor.toFixed(2)}`);
      console.log(`  Avg Win:         +${results.avgWinPercent.toFixed(2)}%`);
      console.log(`  Avg Loss:        ${results.avgLossPercent.toFixed(2)}%`);
      console.log(`  R:R Ratio:       1:${Math.abs(results.avgWinPercent / results.avgLossPercent).toFixed(2)}`);
      console.log(`\n  RISK`);
      console.log(`  Max Drawdown:    ${results.maxDrawdownPercent.toFixed(2)}%`);
      console.log(`  Avg Holding:     ${(results.avgHoldingPeriod / 60).toFixed(1)} hours`);

      // Exit reasons
      const tpCount = results.trades.filter(t => t.exitReason === 'Take Profit').length;
      const slCount = results.trades.filter(t => t.exitReason === 'Stop Loss').length;
      const otherCount = results.totalTrades - tpCount - slCount;
      console.log(`\n  EXITS`);
      console.log(`  Take Profit:     ${tpCount} (${((tpCount / results.totalTrades) * 100 || 0).toFixed(0)}%)`);
      console.log(`  Stop Loss:       ${slCount} (${((slCount / results.totalTrades) * 100 || 0).toFixed(0)}%)`);
      if (otherCount > 0) console.log(`  Other:           ${otherCount}`);

    } catch (err: any) {
      console.error(`Error testing ${name}:`, err.message);
    }
  }

  // Summary table
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY COMPARISON');
  console.log('='.repeat(70));
  console.log('\n| Strategy              | Daily %   | Monthly % | Annual % | Win%  | PF   |');
  console.log('|' + '-'.repeat(69) + '|');

  allResults.sort((a, b) => b.dailyReturn - a.dailyReturn);

  for (const r of allResults) {
    const name = r.name.padEnd(21);
    const daily = (r.dailyReturn >= 0 ? '+' : '') + r.dailyReturn.toFixed(4) + '%';
    const monthly = (r.monthlyReturn >= 0 ? '+' : '') + r.monthlyReturn.toFixed(2) + '%';
    const annual = (r.annualReturn >= 0 ? '+' : '') + r.annualReturn.toFixed(1) + '%';
    const winRate = r.results.winRate.toFixed(1) + '%';
    const pf = r.results.profitFactor.toFixed(2);

    console.log(`| ${name} | ${daily.padStart(9)} | ${monthly.padStart(9)} | ${annual.padStart(8)} | ${winRate.padStart(5)} | ${pf.padStart(4)} |`);
  }

  // Find best performer
  const best = allResults[0];
  const gapToTarget = 0.1 - best.dailyReturn;

  console.log('\n' + '='.repeat(70));
  console.log('CONCLUSION');
  console.log('='.repeat(70));

  if (best.dailyReturn >= 0.1) {
    console.log(`\n TARGET ACHIEVED!`);
    console.log(`\n Best Strategy: ${best.name}`);
    console.log(` Daily Return: ${best.dailyReturn.toFixed(4)}% (target: 0.1%)`);
  } else if (best.dailyReturn > 0) {
    console.log(`\n PROFITABLE but below target`);
    console.log(`\n Best Strategy: ${best.name}`);
    console.log(` Daily Return: ${best.dailyReturn.toFixed(4)}% (target: 0.1%)`);
    console.log(` Gap to target: ${gapToTarget.toFixed(4)}% per day`);
    console.log(`\n To reach 0.1% daily, you would need:`);
    console.log(` - ${(0.1 / best.dailyReturn).toFixed(1)}x leverage, OR`);
    console.log(` - ${(0.1 / best.dailyReturn).toFixed(1)}x more capital`);
  } else {
    console.log(`\n NO PROFITABLE STRATEGIES FOUND`);
    console.log(` Need to continue optimizing...`);
  }

  console.log('\n' + '-'.repeat(70));
  console.log('NOTE: 0.1% daily (36% annual) is very aggressive.');
  console.log('Professional hedge funds average 15-25% annually.');
  console.log('-'.repeat(70));
}

main().catch(console.error);
