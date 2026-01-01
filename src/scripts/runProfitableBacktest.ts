/**
 * COMPREHENSIVE BACKTEST RUNNER
 *
 * Goal: Find strategies that achieve 0.1% daily profit (36% annually)
 */

import { BacktestingEngine, BacktestResults } from '../services/BacktestingEngine';
import { BaseStrategy } from '../strategies/BaseStrategy';

// Optimized strategies (should generate trades and be profitable)
import { OptimizedTrendV2Strategy } from '../strategies/OptimizedTrendV2Strategy';
import { UltraHighRRStrategy } from '../strategies/UltraHighRRStrategy';
import { ConservativeTrendStrategy } from '../strategies/ConservativeTrendStrategy';
import { AggressiveHighRRStrategy } from '../strategies/AggressiveHighRRStrategy';
import { HighFrequencyTrendStrategy } from '../strategies/HighFrequencyTrendStrategy';

// Existing strategies for comparison
import { FinalTrendStrategy } from '../strategies/FinalTrendStrategy';
import { FinalMeanReversionStrategy } from '../strategies/FinalMeanReversionStrategy';

interface StrategyResult {
  name: string;
  results: BacktestResults;
  dailyReturn: number;
  annualReturn: number;
  meetsTarget: boolean;
}

async function runBacktest(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('               COMPREHENSIVE PROFITABLE STRATEGY BACKTEST');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('TARGET: 0.1% daily = 3% monthly = 36% annually');
  console.log('COSTS: 0.35% per round-trip (0.075% fees + 0.1% slippage each way)');
  console.log('DATA: 2 years of 1-minute BTC/USDT candles (1,051,207 candles)');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');

  // Initialize backtesting engine
  const engine = new BacktestingEngine('BTCUSDT');

  console.log('\n[1/3] Loading historical data...\n');
  engine.loadHistoricalData();

  // Calculate data period for daily return calculation
  const candles = engine.getCandles();
  const firstDate = new Date(candles[0].timestamp);
  const lastDate = new Date(candles[candles.length - 1].timestamp);
  const tradingDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`\nData period: ${firstDate.toISOString().split('T')[0]} to ${lastDate.toISOString().split('T')[0]}`);
  console.log(`Trading days: ${tradingDays}`);

  // Define all strategies to test
  const strategies: BaseStrategy[] = [
    // New optimized strategies
    new OptimizedTrendV2Strategy(),
    new UltraHighRRStrategy(),
    new ConservativeTrendStrategy(),
    new AggressiveHighRRStrategy(),
    new HighFrequencyTrendStrategy(),

    // Existing strategies for comparison
    new FinalTrendStrategy(),
    new FinalMeanReversionStrategy()
  ];

  console.log(`\n[2/3] Running backtests on ${strategies.length} strategies...\n`);

  const allResults: StrategyResult[] = [];

  for (const strategy of strategies) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Testing: ${strategy.getName()}`);
    console.log(`${'─'.repeat(70)}`);

    try {
      const results = await engine.runBacktest(strategy, 1000);

      // Calculate daily and annual returns
      const dailyReturn = results.totalPnLPercent / tradingDays;
      const annualReturn = dailyReturn * 365;
      const meetsTarget = dailyReturn >= 0.1;

      allResults.push({
        name: strategy.getName(),
        results,
        dailyReturn,
        annualReturn,
        meetsTarget
      });

      // Detailed output
      console.log(`\n  RESULTS:`);
      console.log(`  ├─ Total PnL: $${results.totalPnL.toFixed(2)} (${results.totalPnLPercent.toFixed(2)}%)`);
      console.log(`  ├─ Daily Return: ${dailyReturn.toFixed(4)}%`);
      console.log(`  ├─ Annual Return: ${annualReturn.toFixed(2)}%`);
      console.log(`  ├─ Total Trades: ${results.totalTrades}`);
      console.log(`  ├─ Win Rate: ${results.winRate.toFixed(2)}%`);
      console.log(`  ├─ Profit Factor: ${results.profitFactor.toFixed(2)}`);
      console.log(`  ├─ Max Drawdown: ${results.maxDrawdownPercent.toFixed(2)}%`);
      console.log(`  ├─ Avg Win: ${results.avgWinPercent.toFixed(2)}%`);
      console.log(`  ├─ Avg Loss: ${results.avgLossPercent.toFixed(2)}%`);
      console.log(`  ├─ Avg Hold: ${(results.avgHoldingPeriod / 60).toFixed(1)} hours`);
      console.log(`  └─ Meets Target: ${meetsTarget ? 'YES!' : 'NO'}`);

    } catch (error: any) {
      console.error(`  ERROR: ${error.message}`);
      allResults.push({
        name: strategy.getName(),
        results: null as any,
        dailyReturn: 0,
        annualReturn: 0,
        meetsTarget: false
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                         FINAL RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');

  // Sort by annual return
  const sortedResults = allResults
    .filter(r => r.results && r.results.totalTrades > 0)
    .sort((a, b) => b.annualReturn - a.annualReturn);

  console.log('\n┌────────────────────────────┬──────────┬──────────┬─────────┬─────────┬────────┬────────┐');
  console.log('│ Strategy                   │  Daily % │ Annual % │ Trades  │ Win %   │ PF     │ Target │');
  console.log('├────────────────────────────┼──────────┼──────────┼─────────┼─────────┼────────┼────────┤');

  for (const result of sortedResults) {
    const name = result.name.substring(0, 26).padEnd(26);
    const daily = result.dailyReturn.toFixed(4).padStart(8);
    const annual = result.annualReturn.toFixed(2).padStart(8);
    const trades = result.results.totalTrades.toString().padStart(7);
    const winRate = result.results.winRate.toFixed(1).padStart(7);
    const pf = result.results.profitFactor.toFixed(2).padStart(6);
    const target = result.meetsTarget ? '  YES  ' : '  NO   ';

    console.log(`│ ${name} │ ${daily} │ ${annual} │ ${trades} │ ${winRate} │ ${pf} │${target}│`);
  }

  console.log('└────────────────────────────┴──────────┴──────────┴─────────┴─────────┴────────┴────────┘');

  // Show strategies with no trades
  const noTradeStrategies = allResults.filter(r => r.results && r.results.totalTrades === 0);
  if (noTradeStrategies.length > 0) {
    console.log('\n  Strategies with NO TRADES (conditions too strict):');
    for (const s of noTradeStrategies) {
      console.log(`    - ${s.name}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ANALYSIS & RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                        ANALYSIS & RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const best = sortedResults[0];
  const targetMet = sortedResults.filter(r => r.meetsTarget);

  if (targetMet.length > 0) {
    console.log('\n  SUCCESS! The following strategies meet the 0.1% daily target:');
    for (const result of targetMet) {
      console.log(`    - ${result.name}: ${result.dailyReturn.toFixed(4)}% daily (${result.annualReturn.toFixed(2)}% annual)`);
    }
  } else {
    console.log('\n  ANALYSIS: No strategy achieved 0.1% daily profit.');
    console.log('\n  BEST PERFORMER:');
    if (best) {
      console.log(`    - Strategy: ${best.name}`);
      console.log(`    - Daily Return: ${best.dailyReturn.toFixed(4)}%`);
      console.log(`    - Annual Return: ${best.annualReturn.toFixed(2)}%`);
      console.log(`    - Win Rate: ${best.results.winRate.toFixed(1)}%`);
      console.log(`    - Profit Factor: ${best.results.profitFactor.toFixed(2)}`);
      console.log(`    - Total Trades: ${best.results.totalTrades}`);
      console.log(`    - Gap to Target: ${(0.1 - best.dailyReturn).toFixed(4)}% daily`);

      // Calculate what would be needed
      const neededWinRate = (0.35 + 0.5 * best.results.avgLossPercent / -100) / (best.results.avgWinPercent / 100 - best.results.avgLossPercent / -100) * 100;
      console.log(`\n    To achieve 0.1% daily with current R:R, would need:`);
      console.log(`    - Win Rate: ~${neededWinRate.toFixed(1)}% (current: ${best.results.winRate.toFixed(1)}%)`);
    }
  }

  // Calculate what's needed
  console.log('\n  MATHEMATICAL REALITY:');
  console.log('    To achieve 0.1% daily with 0.35% cost per trade:');
  console.log('    - Need: +0.45% gross per trade (if 1 trade/day)');
  console.log('    - Or: 60% win rate with 1:2 R:R = 0.60*4% - 0.40*2% - 0.35% = 1.25%/trade');
  console.log('    - Or: 50% win rate with 1:3 R:R = 0.50*6% - 0.50*2% - 0.35% = 1.65%/trade');
  console.log('    - Or: 40% win rate with 1:4 R:R = 0.40*8% - 0.60*2% - 0.35% = 1.45%/trade');

  // Best achievable estimate
  const realisticMax = sortedResults.length > 0 ? sortedResults[0].dailyReturn : 0;
  console.log(`\n  REALISTIC MAXIMUM ACHIEVABLE: ${(realisticMax * 365).toFixed(2)}% annual`);

  if (realisticMax < 0.1) {
    console.log('\n  REASONS FOR GAP:');
    console.log('    1. Trading costs (0.35%) eat into every trade');
    console.log('    2. BTC/USDT is highly efficient - edges are small');
    console.log('    3. 2024-2025 market conditions may not favor these strategies');
    console.log('    4. Win rates below 40% make high R:R strategies unprofitable');
    console.log('\n  RECOMMENDATIONS:');
    console.log('    1. Use maker orders to reduce fees to 0.02% (0.24% round-trip)');
    console.log('    2. Combine multiple strategies for diversification');
    console.log('    3. Accept realistic returns (~2-10% annually)');
    console.log('    4. Focus on risk-adjusted returns (Sharpe ratio)');
    console.log('    5. Trade on exchanges with lower fees (e.g., Bybit, OKX)');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
}

// Run the backtest
runBacktest().catch(console.error);
