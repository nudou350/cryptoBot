/**
 * FINAL Backtest - Production-Ready Strategies
 * Run: npx ts-node scripts/runFinalBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { FinalTrendStrategy } from '../src/strategies/FinalTrendStrategy';
import { FinalMeanReversionStrategy } from '../src/strategies/FinalMeanReversionStrategy';
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
  expectancyPerTrade: number;
}

function analyze(results: BacktestResults): Analysis {
  const days = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const months = days / 30;

  return {
    name: results.strategyName,
    results,
    monthlyReturn: results.totalPnLPercent / months,
    annualReturn: (results.totalPnLPercent / months) * 12,
    isProfitable: results.totalPnL > 0,
    tradesPerMonth: results.totalTrades / months,
    dailyReturn: results.totalPnLPercent / days,
    expectancyPerTrade: results.totalTrades > 0 ? results.totalPnLPercent / results.totalTrades : 0
  };
}

function print(a: Analysis) {
  const r = a.results;
  const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent) : 0;

  const status = a.isProfitable ? '[PROFITABLE]' : '[LOSING]';
  console.log(`\n${'='.repeat(65)}`);
  console.log(`${a.name} ${status}`);
  console.log(`${'='.repeat(65)}`);

  console.log(`\n  RETURNS`);
  console.log(`  -------`);
  console.log(`  Total PnL:       $${r.totalPnL.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);
  console.log(`  Daily Return:    ${a.dailyReturn >= 0 ? '+' : ''}${(a.dailyReturn).toFixed(4)}%`);
  console.log(`  Monthly Return:  ${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(2)}%`);
  console.log(`  Annual Return:   ${a.annualReturn >= 0 ? '+' : ''}${a.annualReturn.toFixed(1)}%`);

  console.log(`\n  TRADE STATISTICS`);
  console.log(`  -----------------`);
  console.log(`  Total Trades:    ${r.totalTrades}`);
  console.log(`  Trades/Month:    ${a.tradesPerMonth.toFixed(1)}`);
  console.log(`  Win Rate:        ${r.winRate.toFixed(1)}%`);
  console.log(`  Profit Factor:   ${r.profitFactor.toFixed(2)}`);
  console.log(`  Expectancy:      ${a.expectancyPerTrade >= 0 ? '+' : ''}${a.expectancyPerTrade.toFixed(3)}% per trade`);

  console.log(`\n  RISK METRICS`);
  console.log(`  -------------`);
  console.log(`  Avg Win:         +${r.avgWinPercent.toFixed(2)}%`);
  console.log(`  Avg Loss:        ${r.avgLossPercent.toFixed(2)}%`);
  console.log(`  R:R Ratio:       1:${rr.toFixed(2)}`);
  console.log(`  Max Drawdown:    ${r.maxDrawdownPercent.toFixed(1)}%`);
  console.log(`  Avg Holding:     ${(r.avgHoldingPeriod / 60).toFixed(1)} hours (${(r.avgHoldingPeriod / 60 / 24).toFixed(1)} days)`);

  if (r.trades && r.trades.length > 0) {
    const tp = r.trades.filter(t => t.exitReason === 'Take Profit').length;
    const sl = r.trades.filter(t => t.exitReason === 'Stop Loss').length;
    console.log(`\n  EXIT BREAKDOWN`);
    console.log(`  --------------`);
    console.log(`  Take Profits:    ${tp} (${(tp/r.trades.length*100).toFixed(0)}%)`);
    console.log(`  Stop Losses:     ${sl} (${(sl/r.trades.length*100).toFixed(0)}%)`);
  }
}

async function main() {
  console.log('='.repeat(65));
  console.log('FINAL STRATEGY BACKTEST - PRODUCTION READY');
  console.log('BTC/USDT with Realistic Fees (0.35% round-trip)');
  console.log('Data: 2 years (Jan 2024 - Jan 2026)');
  console.log('='.repeat(65));

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new OptimalTrendStrategy(),
    new FinalTrendStrategy(),
    new FinalMeanReversionStrategy()
  ];

  const results: Analysis[] = [];

  for (const s of strategies) {
    console.log(`\n[Testing] ${s.getName()}...`);
    const r = await engine.runBacktest(s, 1000);
    const a = analyze(r);
    results.push(a);
    print(a);
  }

  // Summary
  console.log('\n' + '='.repeat(65));
  console.log('COMPARISON TABLE');
  console.log('='.repeat(65));

  console.log('\n| Strategy                 | Total PnL | Win%  | PF   | R:R  | Monthly | Annual   |');
  console.log('|--------------------------|-----------|-------|------|------|---------|----------|');

  results.sort((a, b) => b.results.totalPnLPercent - a.results.totalPnLPercent);
  results.forEach(a => {
    const r = a.results;
    const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent).toFixed(1) : '0.0';
    const pnl = `${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(1)}%`.padStart(9);
    const wr = `${r.winRate.toFixed(0)}%`.padStart(5);
    const pf = r.profitFactor.toFixed(2).padStart(4);
    const monthly = `${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(1)}%`.padStart(7);
    const annual = `${a.annualReturn >= 0 ? '+' : ''}${a.annualReturn.toFixed(0)}%`.padStart(8);

    console.log(`| ${a.name.padEnd(24)} | ${pnl} | ${wr} | ${pf} | 1:${rr.padStart(3)} | ${monthly} | ${annual} |`);
  });

  // Final summary
  const profitable = results.filter(r => r.isProfitable);

  console.log('\n' + '='.repeat(65));
  console.log('FINAL RESULTS');
  console.log('='.repeat(65));

  console.log(`\nProfitable Strategies: ${profitable.length}/${results.length}`);

  if (profitable.length > 0) {
    console.log('\n[SUCCESS] Profitable strategies found:');
    profitable.forEach(a => {
      console.log(`\n  ${a.name}:`);
      console.log(`    Total Return:  +${a.results.totalPnLPercent.toFixed(2)}%`);
      console.log(`    Monthly:       +${a.monthlyReturn.toFixed(2)}%`);
      console.log(`    Annual:        +${a.annualReturn.toFixed(1)}%`);
      console.log(`    Win Rate:      ${a.results.winRate.toFixed(1)}%`);
      console.log(`    Trades/Month:  ${a.tradesPerMonth.toFixed(1)}`);
      console.log(`    Max Drawdown:  ${a.results.maxDrawdownPercent.toFixed(1)}%`);
    });

    // Portfolio recommendation
    if (profitable.length >= 2) {
      const avgMonthly = profitable.reduce((s, a) => s + a.monthlyReturn, 0) / profitable.length;
      const avgDD = profitable.reduce((s, a) => s + a.results.maxDrawdownPercent, 0) / profitable.length;
      console.log('\n  PORTFOLIO APPROACH (running multiple strategies):');
      console.log(`    Diversified Monthly:  +${avgMonthly.toFixed(2)}%`);
      console.log(`    Diversified Annual:   +${(avgMonthly * 12).toFixed(1)}%`);
      console.log(`    Average Drawdown:     ${avgDD.toFixed(1)}%`);
    }

    // Disclaimer
    console.log('\n' + '-'.repeat(65));
    console.log('IMPORTANT DISCLAIMER');
    console.log('-'.repeat(65));
    console.log(`
This is EDUCATIONAL analysis only. NOT financial advice.
- Past performance does not guarantee future results
- Cryptocurrency trading carries extreme risk
- Never trade with money you cannot afford to lose
- Paper trade for 3+ months before going live
- Start with small capital (5-10% of intended amount)
- Monitor daily and adjust if market conditions change
`);
  } else {
    console.log('\n[NEEDS MORE WORK] No profitable strategies in this run.');
  }
}

main().catch(console.error);
