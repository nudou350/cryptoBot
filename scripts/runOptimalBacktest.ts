/**
 * Backtest for OPTIMAL Strategies
 * Run: npx ts-node scripts/runOptimalBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { OptimalMeanReversionStrategy } from '../src/strategies/OptimalMeanReversionStrategy';
import { OptimalTrendStrategy } from '../src/strategies/OptimalTrendStrategy';
import { BaseStrategy } from '../src/strategies/BaseStrategy';

interface Analysis {
  name: string;
  results: BacktestResults;
  monthlyReturn: number;
  annualReturn: number;
  isProfitable: boolean;
  tradesPerMonth: number;
  dailyReturn: number;
}

function analyze(results: BacktestResults): Analysis {
  const days = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const months = days / 30;
  const monthlyReturn = results.totalPnLPercent / months;
  const annualReturn = monthlyReturn * 12;
  const tradesPerMonth = results.totalTrades / months;
  const dailyReturn = results.totalPnLPercent / days;

  return {
    name: results.strategyName,
    results,
    monthlyReturn,
    annualReturn,
    isProfitable: results.totalPnL > 0,
    tradesPerMonth,
    dailyReturn
  };
}

function print(a: Analysis) {
  const r = a.results;
  const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent) : 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${a.name} ${a.isProfitable ? '[PROFITABLE]' : '[LOSING]'}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total PnL:     $${r.totalPnL.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);
  console.log(`Daily:         ${a.dailyReturn >= 0 ? '+' : ''}${a.dailyReturn.toFixed(3)}%`);
  console.log(`Monthly:       ${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(2)}%`);
  console.log(`Annual:        ${a.annualReturn >= 0 ? '+' : ''}${a.annualReturn.toFixed(1)}%`);
  console.log(`Trades:        ${r.totalTrades} (${a.tradesPerMonth.toFixed(1)}/month)`);
  console.log(`Win Rate:      ${r.winRate.toFixed(1)}%`);
  console.log(`Profit Factor: ${r.profitFactor.toFixed(2)}`);
  console.log(`Avg Win:       +${r.avgWinPercent.toFixed(2)}%`);
  console.log(`Avg Loss:      ${r.avgLossPercent.toFixed(2)}%`);
  console.log(`R:R Ratio:     1:${rr.toFixed(2)}`);
  console.log(`Max Drawdown:  ${r.maxDrawdownPercent.toFixed(1)}%`);
  console.log(`Avg Holding:   ${(r.avgHoldingPeriod / 60).toFixed(1)} hours`);

  if (r.trades && r.trades.length > 0) {
    const sl = r.trades.filter(t => t.exitReason === 'Stop Loss').length;
    const tp = r.trades.filter(t => t.exitReason === 'Take Profit').length;
    console.log(`\nExits: ${tp} TP (${(tp/r.trades.length*100).toFixed(0)}%) / ${sl} SL (${(sl/r.trades.length*100).toFixed(0)}%)`);
  }
}

async function main() {
  console.log('OPTIMAL STRATEGY BACKTEST');
  console.log('Hourly resampling with optimized parameters\n');

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new OptimalMeanReversionStrategy(),
    new OptimalTrendStrategy()
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
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));

  const profitable = results.filter(r => r.isProfitable);
  console.log(`\nProfitable: ${profitable.length}/${results.length}`);

  if (profitable.length > 0) {
    console.log('\n*** SUCCESS ***');
    profitable.forEach(a => {
      console.log(`\n${a.name}:`);
      console.log(`  +${a.results.totalPnLPercent.toFixed(2)}% total`);
      console.log(`  +${a.dailyReturn.toFixed(3)}%/day`);
      console.log(`  +${a.monthlyReturn.toFixed(2)}%/month`);
      console.log(`  +${a.annualReturn.toFixed(1)}%/year`);
      console.log(`  ${a.results.winRate.toFixed(1)}% win rate`);
      console.log(`  ${a.results.maxDrawdownPercent.toFixed(1)}% max drawdown`);
    });
  }

  console.log('\n');
}

main().catch(console.error);
