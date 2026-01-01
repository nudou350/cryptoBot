/**
 * Generate sample historical data for backtesting
 * This creates realistic BTC price movements for testing
 */

import fs from 'fs';
import path from 'path';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateRealisticCandles(
  startPrice: number,
  numDays: number,
  volatility: number = 0.02
): Candle[] {
  const candles: Candle[] = [];
  const candlesPerDay = 24 * 60; // 1-minute candles
  const totalCandles = numDays * candlesPerDay;

  const startTime = Date.now() - (numDays * 24 * 60 * 60 * 1000);
  let currentPrice = startPrice;

  console.log(`Generating ${totalCandles.toLocaleString()} candles (${numDays} days)...`);

  for (let i = 0; i < totalCandles; i++) {
    const timestamp = startTime + (i * 60 * 1000); // +1 minute each

    // Simulate price movement with trend and noise
    const trend = Math.sin(i / 10000) * 0.001; // Long-term oscillation
    const noise = (Math.random() - 0.5) * volatility;
    const priceChange = currentPrice * (trend + noise);

    // Calculate OHLC for this candle
    const open = currentPrice;
    const change = priceChange;
    const close = open + change;

    // High and low with some randomness
    const highExtra = Math.abs(change) * Math.random() * 0.5;
    const lowExtra = Math.abs(change) * Math.random() * 0.5;

    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;

    // Volume with some randomness
    const baseVolume = 100 + Math.random() * 200;
    const volume = baseVolume * (1 + Math.abs(change / open) * 10);

    candles.push({
      timestamp,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: parseFloat(volume.toFixed(2))
    });

    currentPrice = close;

    // Progress update
    if ((i + 1) % 100000 === 0) {
      const progress = ((i + 1) / totalCandles * 100).toFixed(1);
      console.log(`Progress: ${progress}%`);
    }
  }

  return candles;
}

async function generateSampleData() {
  console.log('🎲 Generating sample BTC historical data...\n');

  // Generate 90 days of data starting from ~$40,000
  // This is enough for meaningful backtesting while keeping file size reasonable
  const candles = generateRealisticCandles(40000, 90);

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'btc-2year-historical.json');

  const dataToSave = {
    symbol: 'BTCUSDT',
    interval: '1m',
    downloadedAt: new Date().toISOString(),
    startDate: new Date(candles[0].timestamp).toISOString(),
    endDate: new Date(candles[candles.length - 1].timestamp).toISOString(),
    totalCandles: candles.length,
    daysOfData: (candles.length / (24 * 60)).toFixed(1),
    dataSource: 'Generated sample data for testing',
    note: 'This is sample data. Run "npm run download-data" to get real historical data from Binance',
    candles: candles
  };

  console.log('\n💾 Saving data file...');
  fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));

  console.log('\n✅ Sample data generated successfully!');
  console.log(`📁 File: ${filePath}`);
  console.log(`📊 Candles: ${candles.length.toLocaleString()}`);
  console.log(`📅 Date range: ${dataToSave.startDate} to ${dataToSave.endDate}`);
  console.log(`📈 Days: ${dataToSave.daysOfData}`);
  console.log(`💾 Size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\n⚠️  This is SAMPLE data for testing.`);
  console.log(`   For real backtesting, run: npm run download-data`);
}

generateSampleData().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
