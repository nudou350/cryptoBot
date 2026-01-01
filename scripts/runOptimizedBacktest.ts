/**
 * Backtest Script for OPTIMIZED Strategies
 * Run: npx ts-node scripts/runOptimizedBacktest.ts
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { OptimizedMeanReversionStrategy } from '../src/strategies/OptimizedMeanReversionStrategy';
import { OptimizedTrendStrategy } from '../src/strategies/OptimizedTrendStrategy';
import { OptimizedMomentumStrategy } from '../src/strategies/OptimizedMomentumStrategy';
import { OptimizedDipBuyStrategy } from '../src/strategies/OptimizedDipBuyStrategy';
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
  costImpact: number;
}

function analyzeResults(results: BacktestResults): StrategyAnalysis {
  const dayCount = (results.endDate - results.startDate) / (1000 * 60 * 60 * 24);
  const monthCount = dayCount / 30;

  const avgTradePercent = results.totalTrades > 0
    ? results.totalPnLPercent / results.totalTrades
    : 0;

  const winRate = results.winRate / 100;
  const lossRate = 1 - winRate;
  const expectancy = (winRate * results.avgWinPercent) + (lossRate * results.avgLossPercent);

  const tradesPerMonth = results.totalTrades / monthCount;
  const monthlyReturn = results.totalPnLPercent / monthCount;
  const dailyReturn = results.totalPnLPercent / dayCount;
  const annualReturn = monthlyReturn * 12;

  // Cost impact analysis
  const costPerTrade = 0.35;
  const totalCosts = results.totalTrades * costPerTrade;
  const costImpact = results.totalTrades > 0 ? totalCosts / results.totalTrades : 0;

  return {
    name: results.strategyName,
    results,
    avgTradePercent,
    tradesPerMonth,
    monthlyReturn,
    dailyReturn,
    annualReturn,
    isProfitable: results.totalPnL > 0,
    expectancy,
    costImpact
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
  console.log(`  Avg Holding:     ${(r.avgHoldingPeriod / 60).toFixed(1)} hours`);

  if (r.avgLossPercent !== 0) {
    const rrRatio = Math.abs(r.avgWinPercent / r.avgLossPercent);
    console.log(`  R:R Ratio:       1:${rrRatio.toFixed(2)}`);
  }

  console.log('\n--- QUALITY ---');
  console.log(`  Avg Trade:       ${analysis.avgTradePercent >= 0 ? '+' : ''}${analysis.avgTradePercent.toFixed(3)}%`);
  console.log(`  Expectancy:      ${analysis.expectancy >= 0 ? '+' : ''}${analysis.expectancy.toFixed(3)}%`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('OPTIMIZED STRATEGY BACKTEST');
  console.log('BTC/USDT - Realistic Fees (0.35% round-trip)');
  console.log('='.repeat(70));

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategies: BaseStrategy[] = [
    new OptimizedMeanReversionStrategy(),
    new OptimizedTrendStrategy(),
    new OptimizedMomentumStrategy(),
    new OptimizedDipBuyStrategy()
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

  console.log('\n| Strategy                  | PnL     | Win%  | PF   | R:R  | Monthly | Status     |');
  console.log('|---------------------------|---------|-------|------|------|---------|------------|');

  analyses
    .sort((a, b) => b.results.totalPnLPercent - a.results.totalPnLPercent)
    .forEach(a => {
      const r = a.results;
      const status = a.isProfitable ? 'PROFIT' : 'LOSS';
      const pnl = `${r.totalPnLPercent >= 0 ? '+' : ''}${r.totalPnLPercent.toFixed(1)}%`.padStart(7);
      const wr = `${r.winRate.toFixed(0)}%`.padStart(5);
      const pf = r.profitFactor.toFixed(2).padStart(4);
      const rr = r.avgLossPercent !== 0 ? Math.abs(r.avgWinPercent / r.avgLossPercent).toFixed(1) : '0.0';
      const monthly = `${a.monthlyReturn >= 0 ? '+' : ''}${a.monthlyReturn.toFixed(1)}%`.padStart(7);

      console.log(
        `| ${a.name.substring(0, 25).padEnd(25)} | ${pnl} | ${wr} | ${pf} | 1:${rr.padStart(3)} | ${monthly} | ${status.padEnd(10)} |`
      );
    });

  const profitable = analyses.filter(a => a.isProfitable);

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nProfitable: ${profitable.length}/${analyses.length}`);

  if (profitable.length > 0) {
    console.log('\nBest performers:');
    profitable.forEach(a => {
      console.log(`  - ${a.name}: +${a.results.totalPnLPercent.toFixed(1)}% (${a.monthlyReturn.toFixed(2)}%/mo)`);
    });

    // Combined portfolio
    if (profitable.length >= 2) {
      const avgMonthly = profitable.reduce((s, a) => s + a.monthlyReturn, 0) / profitable.length;
      console.log(`\n  Portfolio avg: +${avgMonthly.toFixed(2)}%/month = +${(avgMonthly * 12).toFixed(1)}%/year`);
    }
  }

  const losing = analyses.filter(a => !a.isProfitable);
  if (losing.length > 0) {
    console.log('\nNeed optimization:');
    losing.forEach(a => {
      const issues = [];
      if (a.results.winRate < 50) issues.push(`low win rate (${a.results.winRate.toFixed(0)}%)`);
      if (a.results.profitFactor < 1) issues.push(`poor R:R (PF ${a.results.profitFactor.toFixed(2)})`);
      if (a.results.totalTrades < 10) issues.push('too few trades');
      console.log(`  - ${a.name}: ${a.results.totalPnLPercent.toFixed(1)}% - ${issues.join(', ')}`);
    });
  }

  console.log('\n');
}

main().catch(console.error);
