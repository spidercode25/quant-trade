import { 
  Config, 
  QuoteContext, 
  TradeContext, 
  OrderSide, 
  OrderType, 
  TimeInForceType, 
  Decimal,
  Period,
  AdjustType,
  TradeSessions
} from 'longport';
import { logger } from '../utils/logger';

export class LongbridgeService {
  private config: Config;
  private quoteCtx: QuoteContext | null = null;
  private tradeCtx: TradeContext | null = null;

  constructor() {
    this.config = Config.fromEnv();
  }

  async init(): Promise<void> {
    logger.info('Initializing LongbridgeService...');
    try {
      this.quoteCtx = await QuoteContext.new(this.config);
      this.tradeCtx = await TradeContext.new(this.config);
      logger.info('LongbridgeService initialized successfully.');
    } catch (error) {
      logger.error('Failed to initialize LongbridgeService:', error);
      throw error;
    }
  }

  async getHistoryCandlesticks(symbol: string, days: number) {
    if (!this.quoteCtx) throw new Error('QuoteContext not initialized');
    // Using candlesticks to get the latest 'days' of daily data
    const candles = await this.quoteCtx.candlesticks(
      symbol, 
      Period.Day, 
      days, 
      AdjustType.NoAdjust, 
      TradeSessions.All
    );
    return candles.map(c => ({
      open: Number(c.open.toString()),
      high: Number(c.high.toString()),
      low: Number(c.low.toString()),
      close: Number(c.close.toString()),
      time: c.timestamp
    }));
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    if (!this.quoteCtx) throw new Error('QuoteContext not initialized');
    const quotes = await this.quoteCtx.quote([symbol]);
    if (quotes && quotes.length > 0 && quotes[0]) {
      return Number(quotes[0].lastDone.toString());
    }
    throw new Error(`Failed to get current price for ${symbol}`);
  }

  async getAccountBalance(): Promise<{ totalCash: number; availableCash: number }> {
    if (!this.tradeCtx) throw new Error('TradeContext not initialized');
    const balances = await this.tradeCtx.accountBalance();
    
    // Default to USD or first available
    const balance = balances.find(b => b.currency === 'USD') || balances[0];
    
    if (balance) {
      return {
        totalCash: Number(balance.totalCash.toString()),
        availableCash: Number((balance.cashInfos?.[0]?.availableCash ?? balance.totalCash).toString())
      };
    }
    
    return { totalCash: 0, availableCash: 0 };
  }

  async submitOrder(symbol: string, side: 'buy' | 'sell', quantity: number) {
    if (!this.tradeCtx) throw new Error('TradeContext not initialized');
    
    const orderSide = side === 'buy' ? OrderSide.Buy : OrderSide.Sell;
    
    const resp = await this.tradeCtx.submitOrder({
      symbol,
      orderType: OrderType.MO,
      side: orderSide,
      submittedQuantity: new Decimal(quantity.toString()),
      timeInForce: TimeInForceType.Day
    });
    
    return resp;
  }
}
