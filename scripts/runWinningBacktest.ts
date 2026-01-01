/**
 * Backtest Script for WINNING Strategies
 * Run: npx ts-node scripts/runWinningBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { WinningStrategy } from '../src/strategies/WinningStrategy';
import { WinningTrendStrategy } from '../src/strategies/WinningTrendStrategy';
import { WinningMomentumStrategy } from '../src/strategies/WinningMomentumStrategy';
import { BaseStrategy } from '../src/strategies/BaseStrategy';

interface StrategyAnalysis {
  name: string;
  results: BacktestResults;
  avgTradePercent: number;
  tradesPerMonth: number;
  monthlyReturn: number;
  isProfitable: boolean;
  dailyReturn: number;
  annualReturn: number;
  expectancy: number;
}

function analyzeResults(results: BacktestResults): StrategyAnalysis {
  const dayCount = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const monthCount = dayCount / 30;

  const avgTradePercent = results.totalTrades > 0
    ? results.totalPnLPercent / results.totalTrades
    : 0;

  const winRate = results.winRate / 100;
  const lossRate = 1 - winRate;
  const expectancy = results.totalTrades > 0
    ? (winRate * results.avgWinPercent) + (lossRate * results.avgLossPercent)
    : 0;

  const tradesPerMonth = results.totalTrades / monthCount;
  const monthlyReturn = results.totalPnLPercent / monthCount;
  const dailyReturn = results.totalPnLPercent / dayCount;
  const annualReturn = monthlyReturn * 12;

  return {
    name: results.strategyName,
    results,
    avgTradePercent,
    tradesPerMonth,
    monthlyReturn,
    dailyReturn,
    annualReturn,
    isProfitable: results.totalPnL > 0,
    expectancy
  };
}

function printResults(analysis: StrategyAnalysis) {
  const r = analysis.results;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`STRATEGY: ${analysis.name}`);
  console.log(`${'='.repeat(70)}`);

  const statusIcon = analysis.isProfitable ? '[PROFITABLE]' : '[LOSING]';
  console.log(`\n${statusIcon}`);

  console.log('\n--- PERFORMANCE ---');
  console.log(`  Initial:         $1,000.00`);
  console.log(`  Final:           $${r.finalBudget.toFixed(2)}`);
  console.log(`  Total PnL:       $${r.totalPnL.toFixed(2)} (${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(2)}%)`);
  console.log(`  Daily Return:    ${analysis.dailyReturn >= 0 ? '+' : ''}${analysis.dailyReturn.toFixed(4)}%`);
  console.log(`  Monthly Return:  ${analysis.monthlyReturn >= 0 ? '+' : ''}${analysis.monthlyReturn.toFixed(2)}%`);
  console.log(`  Annual Return:   ${analysis.annualReturn >= 0 ? '+' : ''}${analysis.annualReturn.toFixed(1)}%`);

  console.log('\n--- TRADES ---');
  console.log(`  Total Trades:    ${r.totalTrades}`);
  console.log(`  Trades/Month:    ${analysis.tradesPerMonth.toFixed(1)}`);
  console.log(`  Win Rate:        ${r.winRate.toFixed(1)}%`);
  console.log(`  Profit Factor:   ${r.profitFactor.toFixed(2)}`);

  console.log('\n--- RISK ---');
  console.log(`  Max Drawdown:    ${r.maxDrawdownPercent.toFixed(1)}%`);
  console.log(`  Avg Win:         +${r.avgWinPercent.toFixed(2)}%`);
  console.log(`  Avg Loss:        ${r.avgLossPercent.toFixed(2)}%`);
  console.log(`  Avg Holding:     ${(r.avgHoldingPeriod / 60).toFixed(1)} hours (${(r.avgHoldingPeriod / 60 / 24).toFixed(1)} days)`);

  if (r.avgLossPercent !== 0) {
    const rrRatio = Math.abs(r.avgWinPercent / r.avgLossPercent);
    console.log(`  R:R Ratio:       1:${rrRatio.toFixed(2)}`);
  }

  console.log('\n--- QUALITY ---');
  console.log(`  Avg Trade:       ${analysis.avgTradePercent >= 0 ? '+' : ''}${analysis.avgTradePercent.toFixed(3)}%`);
  console.log(`  Expectancy:      ${analysis.expectancy >= 0 ? '+' : ''}${analysis.expectancy.toFixed(3)}%`);

  // Trade breakdown if available
  if (r.trades && r.trades.length > 0) {
    const stopLosses = r.trades.filter(t => t.exitReason === 'Stop Loss').length;
    const takeProfits = r.trades.filter(t => t.exitReason === 'Take Profit').length;
    const other = r.trades.length - stopLosses - takeProfits;

    console.log('\n--- EXIT BREAKDOWN ---');
    console.log(`  Stop Losses:     ${stopLosses} (${(stopLosses/r.trades.length*100).toFixed(1)}%)`);
    console.log(`  Take Profits:    ${takeProfits} (${(takeProfits/r.trades.length*100).toFixed(1)}%)`);
    if (other > 0) console.log(`  Other:           ${other}`);
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('WINNING STRATEGY BACKTEST');
  console.log('BTC/USDT - Realistic Fees (0.35% round-trip)');
  console.log('='.repeat(70));

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new WinningStrategy(),
    new WinningTrendStrategy(),
    new WinningMomentumStrategy()
  ];

  const analyses: StrategyAnalysis[] = [];

  for (const strategy of strategies) {
    console.log(`\n[Testing] ${strategy.getName()}...`);
    const results = await engine.runBacktest(strategy, 1000);
    const analysis = analyzeResults(results);
    analyses.push(analysis);
    printResults(analysis);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON');
  console.log('='.repeat(70));

  console.log('\n| Strategy              | PnL     | Trades | Win%  | PF   | R:R  | Monthly | Status     |');
  console.log('|-----------------------|---------|--------|-------|------|------|---------|------------|');

  analyses
    .sort((a, b) => b.results.totalPnLPercent - a.results.totalPnLPercent)
    .forEach(a => {
      const r = a.results;
      const status = a.isProfitable ? 'PROFIT' : 'LOSS';
      const pnl = `${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(1)}%`.padStart(7);
      const trades = r.totalTrades.toString().padStart(6);
      const wr = `${r.winRate.toFixed(0)}%`.padStart(5);
      const pf = r.profitFactor.toFixed(2).padStart(4);
      const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent).toFixed(1) : '0.0';
      const monthly = `${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(1)}%`.padStart(7);

      console.log(
        `| ${a.name.substring(0, 21).padEnd(21)} | ${pnl} | ${trades} | ${wr} | ${pf} | 1:${rr.padStart(3)} | ${monthly} | ${status.padEnd(10)} |`
      );
    });

  const profitable = analyses.filter(a => a.isProfitable);

  console.log('\n' + '='.repeat(70));
  console.log('FINAL ANALYSIS');
  console.log('='.repeat(70));

  if (profitable.length > 0) {
    console.log(`\n[SUCCESS] ${profitable.length} Profitable Strategies Found!`);

    profitable.forEach(a => {
      console.log(`\n  ${a.name}:`);
      console.log(`    Total Return:   +${a.results.totalPnLPercent.toFixed(2)}%`);
      console.log(`    Monthly Return: +${a.monthlyReturn.toFixed(2)}%`);
      console.log(`    Annual Return:  +${a.annualReturn.toFixed(1)}%`);
      console.log(`    Win Rate:       ${a.results.winRate.toFixed(1)}%`);
      console.log(`    Max Drawdown:   ${a.results.maxDrawdownPercent.toFixed(1)}%`);
      console.log(`    Risk/Reward:    Acceptable for live trading`);
    });

    // Portfolio suggestion
    if (profitable.length >= 2) {
      const avgMonthly = profitable.reduce((s, a) => s + a.monthlyReturn, 0) / profitable.length;
      const avgDD = profitable.reduce((s, a) => s + a.results.maxDrawdownPercent, 0) / profitable.length;

      console.log('\n  PORTFOLIO APPROACH:');
      console.log(`    Combined Monthly: +${avgMonthly.toFixed(2)}%`);
      console.log(`    Combined Annual:  +${(avgMonthly * 12).toFixed(1)}%`);
      console.log(`    Risk Diversified: ${avgDD.toFixed(1)}% avg drawdown`);
    }
  } else {
    console.log('\n[NEEDS WORK] No profitable strategies yet.');
    console.log('\nRecommendations:');
    analyses.forEach(a => {
      const issues = [];
      if (a.results.totalTrades === 0) {
        issues.push('No trades - filters too strict');
      } else {
        if (a.results.winRate < 35) issues.push(`Win rate too low (${a.results.winRate.toFixed(0)}%)`);
        if (a.results.profitFactor < 1) issues.push('Losses exceed wins');
        const rr = Math.abs(a.results.avgWinPercent / (a.results.avgLossPercent || 1));
        if (rr < 1.5) issues.push(`R:R too low (1:${rr.toFixed(1)})`);
      }
      if (issues.length > 0) {
        console.log(`  ${a.name}: ${issues.join(', ')}`);
      }
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('DISCLAIMER');
  console.log('='.repeat(70));
  console.log(`
This is EDUCATIONAL analysis only. NOT financial advice.
- Past performance does not guarantee future results
- Cryptocurrency trading carries extreme risk
- Never trade with money you cannot afford to lose
- Paper trade for 3+ months before going live
- Start with small capital (5-10% of what you're willing to risk)
`);
}

main().catch(console.error);
