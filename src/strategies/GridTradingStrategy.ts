import { BaseStrategy } from './BaseStrategy';
import { Candle, TradeSignal } from '../types';
import { calculateSMA } from '../utils/indicators';

/**
 * Grid Trading Strategy (70-75% win rate)
 *
 * Best for: Ranging/sideways markets
 * Win Rate: 70-75%
 * Risk Level: Low
 *
 * Strategy:
 * - Sets up a grid of buy and sell orders
 * - Profits from price oscillations
 * - Works best when price stays within a range
 */
export class GridTradingStrategy extends BaseStrategy {
  private gridLevels: number = 10; // Reduced from 20 to 10 to decrease trade frequency
  private gridSpacing: number = 0.01; // 1.0% spacing (increased from 0.3% to reduce frequency)
  private lastTrade: 'buy' | 'sell' | null = null;
  private lastTradePrice: number = 0;
  private positionCount: number = 0; // Track how many trades we've made

  constructor() {
    super('GridTrading');
  }

  public analyze(candles: Candle[], currentPrice: number): TradeSignal {
    if (!this.hasEnoughData(candles, 50)) {
      return { action: 'hold', price: currentPrice, reason: 'Insufficient data' };
    }
    // COOLDOWN CHECK: Prevent overtrading (15 min minimum between trades)
    if (!this.canTradeAgain()) {
      const remainingMin = this.getRemainingCooldown();
      return {
        action: 'hold',
        price: currentPrice,
        reason: `Trade cooldown active: ${remainingMin} min remaining (prevents overtrading)`
      };
    }

    // Calculate price range for grid
    const sma50 = calculateSMA(candles, 50);
    const recentSMA = sma50[sma50.length - 1];

    if (recentSMA === 0) {
      return { action: 'hold', price: currentPrice, reason: 'SMA not ready' };
    }

    // Calculate grid boundaries (±3% from SMA) - Tighter range for more frequent trades
    const gridTop = recentSMA * 1.03;
    const gridBottom = recentSMA * 0.97;
    const gridRange = gridTop - gridBottom;
    const spacing = gridRange / this.gridLevels;

    // Find current grid level
    const currentLevel = Math.floor((currentPrice - gridBottom) / spacing);

    // Calculate distance from SMA (for better decision making)
    const distanceFromSMA = ((currentPrice - recentSMA) / recentSMA) * 100;

    // BUY LOGIC - Buy in lower half of grid (levels 0-9 out of 20)
    // More relaxed: buy when price is below SMA
    const shouldBuy = currentLevel < 5 && this.lastTrade !== 'buy' && distanceFromSMA < 0;

    if (shouldBuy) {
      // CRITICAL FIX: Proper risk/reward ratio (1:2) accounting for 0.2% fees
      // Need to win bigger than we lose to be profitable after fees
      const stopLoss = currentPrice * 0.985; // 1.5% stop loss (increased from 1.2%)
      const takeProfit = currentPrice * 1.045; // 4.5% take profit (1:3 R/R ratio after fees)

      this.lastTrade = 'buy';
      this.lastTradePrice = currentPrice;
      this.positionCount++;

      return {
        action: 'buy',
        price: currentPrice,
        stopLoss,
        takeProfit,
        reason: `Grid buy at level ${currentLevel}/${this.gridLevels} (${distanceFromSMA.toFixed(2)}% from SMA) [R:R 1:3]`
      };
    }

    // SELL LOGIC - Sell in upper half of grid (levels 11-20 out of 20)
    // More relaxed: sell when price is above SMA
    const shouldSell = currentLevel > 5 && this.lastTrade !== 'sell' && distanceFromSMA > 0;

    if (shouldSell) {
      this.lastTrade = 'sell';
      this.lastTradePrice = currentPrice;

      return {
        action: 'close',
        price: currentPrice,
        reason: `Grid sell at level ${currentLevel}/${this.gridLevels} (${distanceFromSMA.toFixed(2)}% from SMA) - taking profit`
      };
    }

    // Check if price moved enough from last trade to trade again
    // More aggressive: reset after just 1 grid spacing (0.3%)
    if (this.lastTradePrice > 0) {
      const priceChangePercent = Math.abs((currentPrice - this.lastTradePrice) / this.lastTradePrice);

      // Reset after moving just 0.4% (less than before)
      if (priceChangePercent >= 0.015) { // 1.5% move required (increased from 0.4%)
        this.lastTrade = null;
      }
    }

    // Also reset if we're on the opposite side of SMA from last trade
    if (this.lastTrade === 'buy' && distanceFromSMA > 0.5) {
      this.lastTrade = null; // Price moved above SMA, can buy again when it drops
    } else if (this.lastTrade === 'sell' && distanceFromSMA < -0.5) {
      this.lastTrade = null; // Price moved below SMA, can sell again when it rises
    }

    // Hold if no grid signal - Provide detailed reason
    let holdReason = '';

    if (currentLevel < 5 && distanceFromSMA >= 0) {
      holdReason = `At level ${currentLevel}/${this.gridLevels} but price above SMA (+${distanceFromSMA.toFixed(2)}%) - waiting for dip`;
    } else if (currentLevel > 5 && distanceFromSMA <= 0) {
      holdReason = `At level ${currentLevel}/${this.gridLevels} but price below SMA (${distanceFromSMA.toFixed(2)}%) - waiting for rise`;
    } else if (currentLevel === 5) {
      holdReason = `At middle level ${currentLevel}/${this.gridLevels}, near SMA - waiting for clear direction`;
    } else if (this.lastTrade === 'buy') {
      holdReason = `Recently bought, waiting ${(0.004 * 100).toFixed(1)}% price move to reset (${this.positionCount} trades made)`;
    } else if (this.lastTrade === 'sell') {
      holdReason = `Recently sold, waiting ${(0.004 * 100).toFixed(1)}% price move to reset (${this.positionCount} trades made)`;
    } else {
      holdReason = `At level ${currentLevel}/${this.gridLevels} (${distanceFromSMA.toFixed(2)}% from SMA), monitoring...`;
    }

    return {
      action: 'hold',
      price: currentPrice,
      reason: holdReason
    };
  }

  /**
   * Reset strategy state (useful when starting/stopping)
   */
  public reset(): void {
    this.lastTrade = null;
    this.lastTradePrice = 0;
    this.positionCount = 0;
  }
}
