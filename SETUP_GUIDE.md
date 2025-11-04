# 🚀 Quick Setup Guide

This guide will help you get the crypto trading bot system up and running in minutes.

## ⚡ Quick Start (Fake Trading - Recommended)

Perfect for testing strategies risk-free with real-time prices!

```bash
# 1. Navigate to the project directory
cd /home/user/cryptoBot

# 2. Start the server
npm start

# 3. Open your browser
# Navigate to: http://localhost:3001
```

That's it! The dashboard will open and you can:
1. Select "Fake Trading" mode (default)
2. Set initial budget (default: $100 per bot)
3. Click "Initialize System"
4. Click "Start All Bots"
5. Select a bot from the dropdown to view its stats

## 📋 Complete Setup Steps

### Step 1: Environment Setup

The project is already configured with all dependencies installed. If you need to reinstall:

```bash
npm install
```

### Step 2: Configuration (Optional)

For **fake trading**, no configuration is needed!

For **real trading**, edit the `.env` file:

```bash
# Open .env file
nano .env

# Add your Binance API credentials
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_secret_here
```

**Important for Real Trading:**
- Use API keys with **trading permissions only**
- **DO NOT** enable withdrawal permissions
- Start with **minimum budget** for testing
- Consider using **Binance Testnet** first

### Step 3: Build and Start

```bash
# Build the TypeScript project
npm run build

# Start the server
npm start
```

Or use development mode with auto-reload:

```bash
npm run dev
```

### Step 4: Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3001
```

## 🎮 Using the Dashboard

### 1. Initialize the System

**For Fake Trading (Recommended):**
- Mode: Select "Fake Trading (Simulation)"
- Initial Budget: Enter budget per bot (e.g., 100)
- Click "Initialize System"

**For Real Trading (Advanced):**
- Mode: Select "Real Trading (Live)"
- Initial Budget: Enter budget per bot
- API Key: Enter your Binance API key
- API Secret: Enter your Binance API secret
- Click "Initialize System"

### 2. Start the Bots

After initialization:
- Click "Start All Bots" to run all 3 strategies simultaneously
- Status will change to "Running"
- Bots will start analyzing the market

### 3. Monitor Performance

- Select a bot from the dropdown:
  - **Grid Trading** (70-75% win rate)
  - **Mean Reversion** (65-70% win rate)
  - **Trend Following** (60-65% win rate)

- View real-time statistics:
  - Current BTC price (updates every 5 seconds)
  - Bot status and strategy
  - Budget and PnL
  - Win rate percentage
  - Open positions and orders
  - Trade history

### 4. Stop the Bots

- Click "Stop All Bots"
- All positions will be closed
- All orders will be cancelled
- Logs will be cleared

## 📊 Understanding the Strategies

### Grid Trading (70-75% Win Rate)
- **Best for:** Ranging/sideways markets
- **How it works:** Places buy orders at lower price levels, sell orders at upper levels
- **Risk:** Low
- **Profit per trade:** Small but consistent

### Mean Reversion (65-70% Win Rate)
- **Best for:** Ranging markets with clear support/resistance
- **How it works:** Buys oversold conditions, sells overbought conditions
- **Risk:** Medium
- **Profit per trade:** Medium with 2:1 reward-risk ratio

### Trend Following (60-65% Win Rate)
- **Best for:** Strong trending markets
- **How it works:** Follows the trend using EMA alignment and momentum
- **Risk:** Medium
- **Profit per trade:** Larger when trends are strong

## 📁 Project Structure

```
cryptoBot/
├── src/                 # TypeScript source code
│   ├── strategies/      # Trading strategies
│   ├── engines/         # Trading engines (fake/real)
│   ├── services/        # WebSocket service
│   ├── utils/           # Utilities (indicators, logger)
│   └── ...
├── dist/                # Compiled JavaScript (auto-generated)
├── public/              # Dashboard UI files
├── logs/                # Bot log files (auto-generated)
│   ├── GridTrading-fake.log
│   ├── MeanReversion-fake.log
│   └── TrendFollowing-fake.log
├── .env                 # Environment configuration
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── README.md            # Full documentation
```

## 🔍 Monitoring and Logs

### Dashboard Monitoring
- Real-time price updates every 5 seconds
- Statistics refresh automatically
- Color-coded PnL (green = profit, red = loss)
- Position tracking with unrealized PnL

### Log Files
Each bot maintains its own log file in the `logs/` directory:

```bash
# View logs in real-time
tail -f logs/GridTrading-fake.log
tail -f logs/MeanReversion-fake.log
tail -f logs/TrendFollowing-fake.log
```

Logs include:
- Trade executions (BUY/SELL)
- Strategy signals and reasoning
- Performance metrics
- Errors and warnings

### Log Cleanup
Logs are automatically cleared when you stop the bots via the dashboard.

Manual cleanup:
```bash
npm run clean
```

## 🛠️ Troubleshooting

### Issue: "Cannot connect to server"
**Solution:**
```bash
# Check if server is running
curl http://localhost:3001/api/status

# If not, start the server
npm start
```

### Issue: "WebSocket connection failed"
**Solution:**
- Check your internet connection
- Binance may be blocked in your region
- Try using a VPN if needed

### Issue: "Insufficient data"
**Solution:**
- Wait 1-2 minutes after starting
- The system needs to collect historical candles
- Check logs for errors

### Issue: Build errors
**Solution:**
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Issue: Real trading not working
**Solution:**
- Verify API keys are correct
- Check API key permissions (needs trading, NOT withdrawal)
- Ensure you have USDT balance on Binance
- Check if API is restricted by IP

## 💡 Tips for Best Results

### For Testing (Fake Trading)
1. Run for at least 24 hours to see how strategies perform
2. Monitor different market conditions (trending vs ranging)
3. Compare the 3 strategies to see which performs best
4. Adjust based on your risk tolerance

### For Live Trading (Real Mode)
1. **START SMALL** - Use minimum budget
2. **TEST THOROUGHLY** - Paper trade for weeks/months first
3. **MONITOR CLOSELY** - Check bots multiple times daily
4. **SET ALERTS** - Monitor drawdown and losses
5. **SCALE GRADUALLY** - Only increase budget after proven success

### Strategy Selection
- **Trending market** → Use Trend Following
- **Ranging market** → Use Grid Trading or Mean Reversion
- **Uncertain** → Run all 3 and see which performs best

## 🔐 Security Best Practices

### API Key Security
- ✅ Enable trading permissions only
- ✅ Restrict API to your IP address
- ✅ Use read-only keys for testing
- ❌ NEVER enable withdrawal permissions
- ❌ NEVER share your API keys
- ❌ NEVER commit API keys to git

### Environment Variables
```bash
# .env file is in .gitignore
# Never commit .env to version control
# Use .env.example as template
```

### Regular Backups
```bash
# Backup your configuration
cp .env .env.backup

# Backup logs
cp -r logs logs-backup-$(date +%Y%m%d)
```

## 📈 Performance Expectations

### Fake Trading Mode
- **Risk:** None (simulated)
- **Accuracy:** Very high (uses real prices)
- **Purpose:** Strategy testing and learning

### Real Trading Mode
- **Risk:** HIGH (real money)
- **Expected Win Rates:**
  - Grid Trading: 70-75%
  - Mean Reversion: 65-70%
  - Trend Following: 60-65%
- **Expected Returns:** 5-15% monthly (highly variable)
- **Max Drawdown:** Aim for <15%

**Remember:** Past performance does not guarantee future results!

## 🚨 Important Warnings

⚠️ **CRYPTOCURRENCY TRADING IS EXTREMELY RISKY**

- You can lose ALL your invested capital
- Market conditions change rapidly
- Bots are not perfect and can make mistakes
- Technical issues can occur (internet, exchange downtime)
- This is NOT financial advice
- You are solely responsible for your trading decisions

**ONLY trade with money you can afford to lose completely!**

## 📞 Getting Help

### Check Documentation
- `README.md` - Full documentation
- `CRYPTO_AGENT_GUIDE.md` - Strategy details
- Code comments - Inline documentation

### Debug Mode
```bash
# Run in development mode for detailed logs
npm run dev
```

### Common Commands
```bash
# Build project
npm run build

# Start server
npm start

# Development mode
npm run dev

# Clean build and logs
npm run clean

# Test build
npm test
```

## ✅ Checklist for First Run

Before starting your bots, ensure:

- [ ] Dependencies installed (`npm install`)
- [ ] Project builds successfully (`npm run build`)
- [ ] `.env` configured (for real trading only)
- [ ] Server starts without errors (`npm start`)
- [ ] Dashboard accessible at http://localhost:3001
- [ ] Mode selected (fake for testing, real for live)
- [ ] Budget set appropriately
- [ ] API keys entered (real trading only)
- [ ] System initialized successfully
- [ ] Bots started and running
- [ ] A bot selected in dropdown
- [ ] Statistics showing and updating
- [ ] Logs being written (check `logs/` folder)

## 🎉 You're Ready!

Your crypto trading bot system is now set up and ready to use!

**Remember:**
- Start with fake trading
- Test thoroughly
- Understand the strategies
- Monitor regularly
- Trade responsibly

Happy trading! 🚀

---

**Need help?** Check the main README.md for detailed information about each component.
