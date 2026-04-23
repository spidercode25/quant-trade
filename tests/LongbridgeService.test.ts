import { LongbridgeService } from '../src/exchange/LongbridgeService';

// Mock longport module to prevent actual network calls during testing
jest.mock('longport', () => {
  return {
    Config: {
      fromEnv: jest.fn().mockReturnValue({})
    },
    QuoteContext: {
      new: jest.fn().mockResolvedValue({
        candlesticks: jest.fn().mockResolvedValue([
          {
            open: { toString: () => '100' },
            high: { toString: () => '105' },
            low: { toString: () => '95' },
            close: { toString: () => '102' },
            timestamp: new Date()
          }
        ]),
        quote: jest.fn().mockResolvedValue([
          { lastDone: { toString: () => '150.5' } }
        ])
      })
    },
    TradeContext: {
      new: jest.fn().mockResolvedValue({
        accountBalance: jest.fn().mockResolvedValue([
          {
            currency: 'USD',
            totalCash: { toString: () => '10000' },
            cashInfos: [{ availableCash: { toString: () => '9000' } }]
          }
        ]),
        submitOrder: jest.fn().mockResolvedValue({
          orderId: 'mock-order-id-123'
        })
      })
    },
    OrderSide: { Buy: 1, Sell: 2 },
    OrderType: { MO: 3 },
    TimeInForceType: { Day: 1 },
    Period: { Day: 1 },
    AdjustType: { NoAdjust: 0 },
    TradeSessions: { All: 1 },
    Decimal: class MockDecimal {
      val: string;
      constructor(val: string) { this.val = val; }
      toString() { return this.val; }
    }
  };
});

describe('LongbridgeService', () => {
  let service: LongbridgeService;

  beforeEach(async () => {
    service = new LongbridgeService();
    await service.init();
  });

  test('should initialize contexts', () => {
    expect((service as any).quoteCtx).toBeDefined();
    expect((service as any).tradeCtx).toBeDefined();
  });

  test('should get history candlesticks', async () => {
    const candles = await service.getHistoryCandlesticks('SPY.US', 60);
    expect(candles.length).toBe(1);
    expect(candles[0].open).toBe(100);
    expect(candles[0].close).toBe(102);
  });

  test('should get current price', async () => {
    const price = await service.getCurrentPrice('AAPL.US');
    expect(price).toBe(150.5);
  });

  test('should get account balance', async () => {
    const balance = await service.getAccountBalance();
    expect(balance.totalCash).toBe(10000);
    expect(balance.availableCash).toBe(9000);
  });

  test('should submit order', async () => {
    const resp = await service.submitOrder('SPY.US', 'buy', 1);
    expect(resp).toBeDefined();
    expect((resp as any).orderId).toBe('mock-order-id-123');
  });
});
