# Historical Data Directory

This directory contains historical BTC/USDT price data for backtesting.

## File: `btc-2year-historical.json`

This file contains 1-minute candle data.

**Default (Included in repo):**
- **Symbol**: BTC/USDT
- **Interval**: 1 minute
- **Duration**: 90 days (sample data for testing)
- **Candles**: ~130,000 data points
- **File Size**: ~22 MB
- **Source**: Generated sample data

**Optional (Download real data):**
- **Duration**: 730 days (~2 years)
- **Candles**: ~1,000,000+ data points
- **File Size**: ~180 MB
- **Source**: Real Binance historical data

## How to Download Data

If the data file is missing, run:

```bash
npm run download-data
```

This will:
1. Fetch 2 years of BTC/USDT data from Binance
2. Save it to `btc-2year-historical.json`
3. Take approximately 5-10 minutes to complete

## When to Update Data

You should update the historical data file:
- **Monthly** - To include the latest market data
- **After major market events** - To capture new patterns
- **When backtesting seems outdated** - If results don't match recent performance

## File Format

```json
{
  "symbol": "BTCUSDT",
  "interval": "1m",
  "downloadedAt": "2024-01-01T00:00:00.000Z",
  "startDate": "2022-01-01T00:00:00.000Z",
  "endDate": "2024-01-01T00:00:00.000Z",
  "totalCandles": 1051200,
  "daysOfData": "730.0",
  "candles": [
    {
      "timestamp": 1640995200000,
      "open": 47000.50,
      "high": 47100.25,
      "low": 46950.00,
      "close": 47050.75,
      "volume": 125.5
    },
    ...
  ]
}
```

## Git Ignore

The `btc-2year-historical.json` file is excluded from git (via .gitignore) because:
- It's very large (~50-100 MB)
- It changes frequently
- Each developer should download their own copy

## Troubleshooting

### "Historical data file not found"
Run: `npm run download-data`

### "Failed to fetch"
Check your internet connection and ensure Binance API is accessible.

### "Rate limit exceeded"
The download script includes automatic rate limiting. Wait a few minutes and try again.
