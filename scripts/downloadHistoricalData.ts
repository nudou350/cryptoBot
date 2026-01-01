/**
 * Script to download 2 years of BTC/USDT historical data from Binance
 * Run this script to update the historical data file
 *
 * Usage: npm run download-data
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

async function downloadHistoricalData(daysBack: number = 730): Promise<void> {
  console.log(`📊 Downloading ${daysBack} days of BTC/USDT historical data...`);

  const symbol = 'BTCUSDT';
  const now = Date.now();
  const startTime = now - (daysBack * 24 * 60 * 60 * 1000);
  const interval = '1m';
  const limit = 1000; // Max allowed by Binance

  const allCandles: Candle[] = [];
  let currentStartTime = startTime;

  // Calculate how many requests we need
  const totalMinutes = daysBack * 24 * 60;
  const totalRequests = Math.ceil(totalMinutes / limit);

  console.log(`📡 Estimated ${totalRequests} API requests needed...`);
  console.log(`⏱️  This may take 5-10 minutes. Please wait...\n`);

  for (let i = 0; i < totalRequests; i++) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStartTime}&limit=${limit}`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`❌ Request failed with status ${response.status}`);
        break;
      }

      const data: any = await response.json();

      if (!data || data.length === 0) {
        console.log(`✅ No more data available`);
        break;
      }

      const candles: Candle[] = data.map((kline: any) => ({
        timestamp: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }));

      allCandles.push(...candles);

      // Update start time for next batch
      currentStartTime = candles[candles.length - 1].timestamp + 60000; // +1 minute

      // Progress update
      if ((i + 1) % 50 === 0 || i === totalRequests - 1) {
        const progress = ((i + 1) / totalRequests * 100).toFixed(1);
        const candlesCount = allCandles.length.toLocaleString();
        console.log(`📈 Progress: ${progress}% - ${candlesCount} candles downloaded`);
      }

      // Rate limiting: Binance allows ~1200 requests per minute
      // Adding small delay to be safe
      if (i % 100 === 0 && i > 0) {
        console.log('⏸️  Pausing 1 second to respect rate limits...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Stop if we've reached the present
      if (currentStartTime >= now) {
        break;
      }
    } catch (error) {
      console.error(`❌ Error fetching batch ${i}:`, error);
      // Continue with what we have
      break;
    }
  }

  // Save to file
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, 'btc-2year-historical.json');

  const dataToSave = {
    symbol,
    interval,
    downloadedAt: new Date().toISOString(),
    startDate: new Date(allCandles[0].timestamp).toISOString(),
    endDate: new Date(allCandles[allCandles.length - 1].timestamp).toISOString(),
    totalCandles: allCandles.length,
    daysOfData: (allCandles.length / (24 * 60)).toFixed(1),
    candles: allCandles
  };

  fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));

  console.log('\n✅ Download complete!');
  console.log(`📁 File saved to: ${filePath}`);
  console.log(`📊 Total candles: ${allCandles.length.toLocaleString()}`);
  console.log(`📅 Date range: ${dataToSave.startDate} to ${dataToSave.endDate}`);
  console.log(`📈 Days of data: ${dataToSave.daysOfData}`);
  console.log(`💾 File size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);
}

// Run the script
downloadHistoricalData(730).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
