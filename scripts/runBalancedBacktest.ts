/**
 * Backtest for BALANCED Strategies
 * Run: npx ts-node scripts/runBalancedBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { BalancedMeanReversionStrategy } from '../src/strategies/BalancedMeanReversionStrategy';
import { BalancedTrendStrategy } from '../src/strategies/BalancedTrendStrategy';
import { BaseStrategy } from '../src/strategies/BaseStrategy';

interface Analysis {
  name: string;
  results: BacktestResults;
  monthlyReturn: number;
  annualReturn: number;
  isProfitable: boolean;
}

function analyze(results: BacktestResults): Analysis {
  const dayCount = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const monthCount = dayCount / 30;
  const monthlyReturn = results.totalPnLPercent / monthCount;
  const annualReturn = monthlyReturn * 12;

  return {
    name: results.strategyName,
    results,
    monthlyReturn,
    annualReturn,
    isProfitable: results.totalPnL > 0
  };
}

function print(a: Analysis) {
  const r = a.results;
  const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent).toFixed(2) : 'N/A';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${a.name} ${a.isProfitable ? '[PROFITABLE]' : '[LOSING]'}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`PnL:        $${r.totalPnL.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);
  console.log(`Monthly:    ${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(2)}%`);
  console.log(`Annual:     ${a.annualReturn >= 0 ? '+' : ''}${a.annualReturn.toFixed(1)}%`);
  console.log(`Trades:     ${r.totalTrades} (${(r.totalTrades / 24).toFixed(1)}/month)`);
  console.log(`Win Rate:   ${r.winRate.toFixed(1)}%`);
  console.log(`PF:         ${r.profitFactor.toFixed(2)}`);
  console.log(`Avg Win:    +${r.avgWinPercent.toFixed(2)}%`);
  console.log(`Avg Loss:   ${r.avgLossPercent.toFixed(2)}%`);
  console.log(`R:R:        1:${rr}`);
  console.log(`Drawdown:   ${r.maxDrawdownPercent.toFixed(1)}%`);
  console.log(`Holding:    ${(r.avgHoldingPeriod / 60).toFixed(1)} hours`);
}

async function main() {
  console.log('BALANCED STRATEGY BACKTEST\n');

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new BalancedMeanReversionStrategy(),
    new BalancedTrendStrategy()
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
    profitable.forEach(a => {
      console.log(`  - ${a.name}: +${a.results.totalPnLPercent.toFixed(1)}% (${a.monthlyReturn.toFixed(1)}%/mo)`);
    });
  }
}

main().catch(console.error);
