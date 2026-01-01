/**
 * Leverage Backtest - Simulating 2x, 3x, 5x leverage on FinalTrend
 *
 * Since 0.1% daily without leverage is not achievable with realistic trading,
 * this shows what leverage would yield.
 *
 * WARNING: Leverage magnifies BOTH gains AND losses!
 */

import { BacktestingEngine, BacktestResults } from '../src/services/BacktestingEngine';
import { FinalTrendStrategy } from '../src/strategies/FinalTrendStrategy';

interface LeverageResult {
  leverage: number;
  totalReturn: number;
  dailyReturn: number;
  monthlyReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  leveragedDrawdown: number;
  liquidationRisk: boolean;
}

async function main() {
  console.log('='.repeat(70));
  console.log('LEVERAGE IMPACT ANALYSIS - FinalTrend Strategy');
  console.log('='.repeat(70));
  console.log('\nWARNING: Leverage magnifies both profits AND losses!');
  console.log('High leverage = high liquidation risk\n');

  const engine = new BacktestingEngine('BTCUSDT');
  engine.loadHistoricalData();

  const strategy = new FinalTrendStrategy();
  const results = await engine.runBacktest(strategy, 1000);

  const DAYS = 730;
  const baseDaily = results.totalPnLPercent / DAYS;
  const baseDrawdown = results.maxDrawdownPercent;

  console.log('\n--- BASE STRATEGY (No Leverage) ---');
  console.log(`Total Return: ${results.totalPnLPercent.toFixed(2)}%`);
  console.log(`Daily Return: ${baseDaily.toFixed(4)}%`);
  console.log(`Max Drawdown: ${baseDrawdown.toFixed(2)}%`);

  console.log('\n--- LEVERAGE SIMULATION ---\n');

  const leverages = [1, 2, 3, 5, 10, 14.5];
  const leverageResults: LeverageResult[] = [];

  for (const lev of leverages) {
    const leveragedReturn = results.totalPnLPercent * lev;
    const leveragedDaily = baseDaily * lev;
    const leveragedMonthly = leveragedDaily * 30;
    const leveragedAnnual = leveragedDaily * 365;
    const leveragedDrawdown = baseDrawdown * lev;
    const liquidationRisk = leveragedDrawdown > 100; // Would have been liquidated

    leverageResults.push({
      leverage: lev,
      totalReturn: leveragedReturn,
      dailyReturn: leveragedDaily,
      monthlyReturn: leveragedMonthly,
      annualReturn: leveragedAnnual,
      maxDrawdown: baseDrawdown,
      leveragedDrawdown,
      liquidationRisk
    });
  }

  console.log('| Leverage | Daily %  | Monthly % | Annual % | Leveraged DD | Risk     |');
  console.log('|' + '-'.repeat(69) + '|');

  for (const r of leverageResults) {
    const lev = `${r.leverage}x`.padEnd(8);
    const daily = `${r.dailyReturn >= 0 ? '+' : ''}${r.dailyReturn.toFixed(4)}%`.padStart(8);
    const monthly = `${r.monthlyReturn >= 0 ? '+' : ''}${r.monthlyReturn.toFixed(2)}%`.padStart(9);
    const annual = `${r.annualReturn >= 0 ? '+' : ''}${r.annualReturn.toFixed(1)}%`.padStart(8);
    const dd = `${r.leveragedDrawdown.toFixed(1)}%`.padStart(12);
    const risk = r.liquidationRisk ? 'LIQUIDATED' : r.leveragedDrawdown > 50 ? 'HIGH' : r.leveragedDrawdown > 20 ? 'MEDIUM' : 'LOW';

    console.log(`| ${lev} | ${daily} | ${monthly} | ${annual} | ${dd} | ${risk.padEnd(8)} |`);
  }

  // Find leverage needed for 0.1% daily
  const targetLeverage = 0.1 / baseDaily;

  console.log('\n' + '='.repeat(70));
  console.log('ANALYSIS');
  console.log('='.repeat(70));

  console.log(`\nTo achieve 0.1% daily target:`);
  console.log(`- Required leverage: ${targetLeverage.toFixed(1)}x`);
  console.log(`- This would result in ${(baseDrawdown * targetLeverage).toFixed(1)}% max drawdown`);

  if (baseDrawdown * targetLeverage > 100) {
    console.log(`- WARNING: You would have been LIQUIDATED during the backtest period!`);
  }

  console.log('\n--- RECOMMENDATION ---\n');

  // Find safest leverage that achieves reasonable returns
  const safeMaxDrawdown = 25; // 25% max drawdown acceptable
  const safeLeverage = Math.floor(safeMaxDrawdown / baseDrawdown);

  console.log(`Maximum safe leverage (≤25% drawdown): ${safeLeverage}x`);
  console.log(`With ${safeLeverage}x leverage:`);
  console.log(`  - Daily return: ${(baseDaily * safeLeverage).toFixed(4)}%`);
  console.log(`  - Monthly return: ${(baseDaily * safeLeverage * 30).toFixed(2)}%`);
  console.log(`  - Annual return: ${(baseDaily * safeLeverage * 365).toFixed(1)}%`);
  console.log(`  - Max drawdown: ${(baseDrawdown * safeLeverage).toFixed(1)}%`);

  console.log('\n' + '-'.repeat(70));
  console.log('IMPORTANT DISCLAIMER');
  console.log('-'.repeat(70));
  console.log('- Leverage trading is EXTREMELY risky');
  console.log('- Past performance does NOT guarantee future results');
  console.log('- You can lose MORE than your initial investment');
  console.log('- This is EDUCATIONAL only, NOT financial advice');
  console.log('- Consult a financial advisor before using leverage');
  console.log('-'.repeat(70));
}

main().catch(console.error);
