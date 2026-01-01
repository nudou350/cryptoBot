/**
 * Backtest for HOURLY-RESAMPLED Strategies
 * Run: npx ts-node scripts/runHourlyBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { HourlyMeanReversionStrategy } from '../src/strategies/HourlyMeanReversionStrategy';
import { HourlyTrendStrategy } from '../src/strategies/HourlyTrendStrategy';
import { BaseStrategy } from '../src/strategies/BaseStrategy';

interface Analysis {
  name: string;
  results: BacktestResults;
  monthlyReturn: number;
  annualReturn: number;
  isProfitable: boolean;
  tradesPerMonth: number;
}

function analyze(results: BacktestResults): Analysis {
  const dayCount = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const monthCount = dayCount / 30;
  const monthlyReturn = results.totalPnLPercent / monthCount;
  const annualReturn = monthlyReturn * 12;
  const tradesPerMonth = results.totalTrades / monthCount;

  return {
    name: results.strategyName,
    results,
    monthlyReturn,
    annualReturn,
    isProfitable: results.totalPnL > 0,
    tradesPerMonth
  };
}

function print(a: Analysis) {
  const r = a.results;
  const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent).toFixed(2) : 'N/A';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${a.name} ${a.isProfitable ? '[PROFITABLE]' : '[LOSING]'}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`PnL:           $${r.totalPnL.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);
  console.log(`Monthly:       ${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(2)}%`);
  console.log(`Annual:        ${a.annualReturn >= 0 ? '+' : ''}${a.annualReturn.toFixed(1)}%`);
  console.log(`Total Trades:  ${r.totalTrades}`);
  console.log(`Trades/Month:  ${a.tradesPerMonth.toFixed(1)}`);
  console.log(`Win Rate:      ${r.winRate.toFixed(1)}%`);
  console.log(`Profit Factor: ${r.profitFactor.toFixed(2)}`);
  console.log(`Avg Win:       +${r.avgWinPercent.toFixed(2)}%`);
  console.log(`Avg Loss:      ${r.avgLossPercent.toFixed(2)}%`);
  console.log(`R:R Ratio:     1:${rr}`);
  console.log(`Max Drawdown:  ${r.maxDrawdownPercent.toFixed(1)}%`);
  console.log(`Avg Holding:   ${(r.avgHoldingPeriod / 60).toFixed(1)} hours`);

  // Exit breakdown
  if (r.trades && r.trades.length > 0) {
    const sl = r.trades.filter(t => t.exitReason === 'Stop Loss').length;
    const tp = r.trades.filter(t => t.exitReason === 'Take Profit').length;
    const other = r.trades.length - sl - tp;

    console.log(`\nExit Breakdown:`);
    console.log(`  Stop Loss:    ${sl} (${(sl/r.trades.length*100).toFixed(0)}%)`);
    console.log(`  Take Profit:  ${tp} (${(tp/r.trades.length*100).toFixed(0)}%)`);
    if (other > 0) console.log(`  Other:        ${other}`);
  }
}

async function main() {
  console.log('HOURLY-RESAMPLED STRATEGY BACKTEST');
  console.log('Using 1-min data resampled to hourly for signals\n');

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new HourlyMeanReversionStrategy(),
    new HourlyTrendStrategy()
  ];

  const results: Analysis[] = [];

  for (const s of strategies) {
    console.log(`Testing ${s.getName()}...`);
    const r = await engine.runBacktest(s, 1000);
    const a = analyze(r);
    results.push(a);
    print(a);
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const profitable = results.filter(r => r.isProfitable);
  console.log(`\nProfitable: ${profitable.length}/${results.length}`);

  if (profitable.length > 0) {
    console.log('\nWINNERS:');
    profitable.forEach(a => {
      console.log(`  ${a.name}:`);
      console.log(`    Total: +${a.results.totalPnLPercent.toFixed(1)}%`);
      console.log(`    Monthly: +${a.monthlyReturn.toFixed(2)}%`);
      console.log(`    Annual: +${a.annualReturn.toFixed(1)}%`);
      console.log(`    Win Rate: ${a.results.winRate.toFixed(1)}%`);
      console.log(`    Trades/Month: ${a.tradesPerMonth.toFixed(1)}`);
    });
  } else {
    console.log('\nNo profitable strategies yet.');
    console.log('\nAnalysis:');
    results.forEach(a => {
      const issues = [];
      if (a.results.totalTrades < 50) issues.push('few trades');
      if (a.results.winRate < 50) issues.push(`low win rate (${a.results.winRate.toFixed(0)}%)`);
      if (a.results.profitFactor < 1) issues.push('PF < 1');
      console.log(`  ${a.name}: ${issues.join(', ') || 'needs tuning'}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('NOTES');
  console.log('='.repeat(60));
  console.log(`
- Hourly resampling reduces noise from 1-minute data
- Signals are generated based on hourly candle patterns
- Stops/targets are still checked on each 1-min candle
- This approach filters out many false signals
`);
}

main().catch(console.error);
