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
        ]),
        historyCandlesticksByOffset: jest.fn().mockResolvedValue([
          {
            open: { toString: () => '200' },
            high: { toString: () => '210' },
            low: { toString: () => '195' },
            close: { toString: () => '205' },
            volume: 50000,
            timestamp: new Date('2026-05-11T09:45:00Z')
          },
          {
            open: { toString: () => '205' },
            high: { toString: () => '215' },
            low: { toString: () => '202' },
            close: { toString: () => '212' },
            volume: 62000,
            timestamp: new Date('2026-05-11T10:00:00Z')
          }
        ]),
        calcIndexes: jest.fn().mockResolvedValue([
          { volumeRatio: { toString: () => '2.35' } }
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
    Period: { Day: 14, Min_15: 6 },
    AdjustType: { NoAdjust: 0 },
    TradeSessions: { All: 1, Intraday: 0 },
    CalcIndex: { VolumeRatio: 10 },
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

  test('should get intraday candlesticks via historyCandlesticksByOffset', async () => {
    const { Period, AdjustType, TradeSessions } = require('longport');
    const candles = await service.getIntradayCandlesticks('AAPL.US', Period.Min_15, 2);
    
    expect(candles).toHaveLength(2);
    expect(candles[0].open).toBe(200);
    expect(candles[0].high).toBe(210);
    expect(candles[0].low).toBe(195);
    expect(candles[0].close).toBe(205);
    expect(candles[0].volume).toBe(50000);
    expect(candles[1].close).toBe(212);
    expect(candles[1].volume).toBe(62000);

    const quoteCtx = (service as any).quoteCtx;
    expect(quoteCtx.historyCandlesticksByOffset).toHaveBeenCalledWith(
      'AAPL.US',
      Period.Min_15,
      AdjustType.NoAdjust,
      false,
      null,
      2,
      TradeSessions.Intraday
    );
  });

  test('should get quote volume ratio via calcIndexes', async () => {
    const { CalcIndex } = require('longport');
    const ratio = await service.getQuoteVolumeRatio('AAPL.US');
    
    expect(ratio).toBe(2.35);

    const quoteCtx = (service as any).quoteCtx;
    expect(quoteCtx.calcIndexes).toHaveBeenCalledWith(
      ['AAPL.US'],
      [CalcIndex.VolumeRatio]
    );
  });

  test('should return fallback 1.0 when volumeRatio is null', async () => {
    const quoteCtx = (service as any).quoteCtx;
    quoteCtx.calcIndexes.mockResolvedValueOnce([{ volumeRatio: null }]);
    
    const ratio = await service.getQuoteVolumeRatio('AAPL.US');
    expect(ratio).toBe(1.0);
  });
});
