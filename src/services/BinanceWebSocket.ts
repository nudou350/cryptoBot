import WebSocket from 'ws';
import { Candle } from '../types';

export class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private currentPrice: number = 0;
  private candles: Candle[] = [];
  private priceCallbacks: Set<(price: number) => void> = new Set();
  private candleCallbacks: Set<(candles: Candle[]) => void> = new Set();
  private readonly symbol: string;
  private readonly interval: string;
  private isConnected: boolean = false;

  constructor(symbol: string = 'btcusdt', interval: string = '1m') {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
  }

  public connect(): void {
    const wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@kline_${this.interval}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log(`[WebSocket] Connected to Binance for ${this.symbol.toUpperCase()}`);
      this.isConnected = true;
      this.startPingPong();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.e === 'kline') {
          const kline = message.k;

          // Update current price
          this.currentPrice = parseFloat(kline.c);
          this.notifyPriceListeners(this.currentPrice);

          // Update candles
          const candle: Candle = {
            timestamp: kline.t,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v)
          };

          // Keep last 100 candles
          if (kline.x) { // Candle is closed
            this.candles.push(candle);
            if (this.candles.length > 100) {
              this.candles.shift();
            }
            this.notifyCandleListeners(this.candles);
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('[WebSocket] Error:', error.message);
    });

    this.ws.on('close', () => {
      console.log('[WebSocket] Connection closed. Reconnecting in 5 seconds...');
      this.isConnected = false;
      this.cleanup();
      this.scheduleReconnect();
    });
  }

  private startPingPong(): void {
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      console.log('[WebSocket] Attempting to reconnect...');
      this.connect();
    }, 5000);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  public disconnect(): void {
    console.log('[WebSocket] Disconnecting...');
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  public getCurrentPrice(): number {
    return this.currentPrice;
  }

  public getCandles(): Candle[] {
    return [...this.candles];
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Subscribe to price updates
  public onPriceUpdate(callback: (price: number) => void): void {
    this.priceCallbacks.add(callback);
  }

  // Subscribe to candle updates
  public onCandleUpdate(callback: (candles: Candle[]) => void): void {
    this.candleCallbacks.add(callback);
  }

  // Unsubscribe from price updates
  public offPriceUpdate(callback: (price: number) => void): void {
    this.priceCallbacks.delete(callback);
  }

  // Unsubscribe from candle updates
  public offCandleUpdate(callback: (candles: Candle[]) => void): void {
    this.candleCallbacks.delete(callback);
  }

  private notifyPriceListeners(price: number): void {
    this.priceCallbacks.forEach(callback => {
      try {
        callback(price);
      } catch (error) {
        console.error('[WebSocket] Error in price callback:', error);
      }
    });
  }

  private notifyCandleListeners(candles: Candle[]): void {
    this.candleCallbacks.forEach(callback => {
      try {
        callback(candles);
      } catch (error) {
        console.error('[WebSocket] Error in candle callback:', error);
      }
    });
  }

  // Fetch historical candles from REST API
  public async fetchHistoricalCandles(limit: number = 100): Promise<void> {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${this.symbol.toUpperCase()}&interval=${this.interval}&limit=${limit}`;
      const response = await fetch(url);
      const data: any = await response.json();

      this.candles = data.map((kline: any) => ({
        timestamp: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }));

      if (this.candles.length > 0) {
        this.currentPrice = this.candles[this.candles.length - 1].close;
      }

      console.log(`[WebSocket] Fetched ${this.candles.length} historical candles`);
    } catch (error) {
      console.error('[WebSocket] Error fetching historical candles:', error);
    }
  }
}
