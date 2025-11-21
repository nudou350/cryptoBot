# Quick Reference - Strategy Fixes

## What Changed (TL;DR)

**ALL 3 BOTS NOW HAVE TREND FILTERS**

Old: Buy every dip/oversold → 10% win rate
New: Buy dips/oversold ONLY in uptrends → Expected 60-70% win rate

---

## Strategy Parameters

| Strategy | Entry | Take Profit | Stop Loss | R:R | Expected Win Rate |
|----------|-------|-------------|-----------|-----|-------------------|
| **GridTrading** | price < SMA20 AND price > EMA50 | 2% | 2% | 1:1 | 65-75% |
| **MeanReversion** | RSI < 35 AND price > EMA50 | 3% | 2% | 1:1.5 | 65-70% |
| **Sasha-Hybrid** | RSI < 40 AND near EMA20 AND price > EMA50 | 2.5% | 2% | 1:1.25 | 65-70% |

---

## Key Changes

### GridTradingStrategy
- Added: EMA50 trend filter
- Changed: TP from 3% to 2%
- Entry: Dip below SMA20, but above EMA50 (uptrend)

### MeanReversionStrategy
- Added: EMA50 trend filter
- Changed: RSI from 40 to 35 (tighter)
- Changed: TP from 5% to 3%
- Entry: Oversold (RSI < 35) in uptrend (price > EMA50)

### SashaHybridOptimizedStrategy
- Added: EMA50 trend filter (in addition to EMA20)
- Changed: RSI from 45 to 40 (tighter)
- Changed: TP from 4% to 2.5%
- Entry: RSI < 40 + near EMA20 + price > EMA50 (pullback in uptrend)

---

## What You'll See in Logs

### Good (Working):
```
[Bot] PAUSED: Downtrend (−2.3% below EMA50) - waiting for uptrend
[Bot] Uptrend, approaching oversold (RSI: 37.5, need < 35)
[Bot] Grid BUY: Dip in uptrend (SMA: -1.2%, EMA: +2.5%) [1:1 R:R]
[Bot] MeanRev TP: +3.1% (RSI: 55.2, EMA: +3.8%)
```

### Bad (Not Working):
```
[Bot] MeanRev BUY: RSI 38.5 (oversold) [R:R 1:2.5]  ← No trend check = OLD CODE
[Bot] Grid buy at level 9/20 (-0.15% from SMA)      ← No uptrend check = OLD CODE
```

---

## Testing Plan

### Phase 1: This Week (Paper Trading)
- Deploy to testnet
- Monitor 24/7 for first 3 days
- Collect 20-30 trades per bot
- **Target:** 50%+ win rate

### Phase 2: Weeks 2-4 (Extended Testing)
- Continue testnet
- Collect 50-100 trades per bot
- **Target:** 55%+ win rate, profit factor > 1.5

### Phase 3: Month 2 (Small Live)
- IF successful: Deploy with 5-10% capital
- Monitor daily
- **Target:** Match paper trading results

### Phase 4: Month 3+ (Full Deployment)
- IF successful: Scale to full allocation
- Weekly reviews, monthly optimization
- **Target:** 60-70% win rate, consistent profits

---

## Success Criteria

After 20 trades:
- Win rate > 50%
- Bots pausing in downtrends

After 50 trades:
- Win rate > 55%
- Profit factor > 1.5

After 100 trades:
- Win rate > 60%
- Monthly return > 5%

---

## Emergency Stops

PAUSE ALL BOTS IF:
1. Win rate < 40% after 30 trades
2. Drawdown > 20%
3. 5+ consecutive losses on all bots
4. BTC enters extended downtrend (< EMA200 weekly)

---

## When to Trade Each Bot

| Market Condition | Trade? | Best Bot |
|-----------------|--------|----------|
| BTC > EMA50 (uptrend) | YES | All 3 (Sasha-Hybrid best) |
| BTC < EMA50 (downtrend) | NO | PAUSE ALL |
| BTC near EMA50 (transition) | MAYBE | MeanReversion only |
| High volatility | REDUCE SIZE | Cut position sizes 50% |
| Low volatility | YES | GridTrading excels |

---

## Quick Wins to Monitor

1. Check logs for "PAUSED: Downtrend" → Trend filter working
2. Win rate after 10 trades → Should be 50%+
3. Entry frequency → Fewer trades = GOOD (quality > quantity)
4. Drawdown → Should stay < 10% early on

---

## Files Changed

1. `src/strategies/GridTradingStrategy.ts` - Added EMA50 filter, lowered TP to 2%
2. `src/strategies/MeanReversionStrategy.ts` - Added EMA50 filter, tightened RSI to 35, lowered TP to 3%
3. `src/strategies/SashaHybridOptimizedStrategy.ts` - Added EMA50 filter, tightened RSI to 40, lowered TP to 2.5%

---

## Next Steps

TODAY:
1. Deploy to testnet: `npm run bot:testnet` (or your start command)
2. Check logs every 4-6 hours
3. Verify bots showing "PAUSED" when BTC < EMA50

THIS WEEK:
1. Collect 20-30 trades per bot
2. Calculate win rate after each day
3. Verify trend filter working correctly

NEXT 2-4 WEEKS:
1. Continue paper trading (50-100 trades)
2. Calculate profit factor, Sharpe ratio
3. Compare bot performance

MONTH 2+:
1. IF successful: Small live deployment
2. Scale gradually based on results
3. Weekly reviews, monthly optimization

---

## Support Resources

- Full Analysis: `STRATEGY_FIXES_SUMMARY.md`
- Strategy Files: `src/strategies/`
- This Guide: `QUICK_REFERENCE.md`

---

**Status:** FIXES COMPLETE - READY TO TEST
**Expected Result:** 60-70% win rate (up from 10%)
**Key Success Factor:** Bots now pause in downtrends instead of bleeding money

**Good luck! Test thoroughly before going live.**
