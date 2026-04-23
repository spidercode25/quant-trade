import { isTradingTime, getStockPool } from '../src/bot/TradingBot';

describe('TradingBot', () => {
  test('Test Case 10: isTradingTime', () => {
    // Note: JS Date parsing treats ISO strings as UTC.
    // New York is UTC-5 in winter, UTC-4 in summer. 
    // 2024-01-08 is winter (UTC-5). 
    // 14:45Z = 09:45 EST.
    expect(isTradingTime(new Date('2024-01-08T14:45:00Z'))).toBe(true);

    // 13:30Z = 08:30 EST (Before open)
    expect(isTradingTime(new Date('2024-01-08T13:30:00Z'))).toBe(false);

    // 21:30Z = 16:30 EST (After close)
    expect(isTradingTime(new Date('2024-01-08T21:30:00Z'))).toBe(false);

    // 2024-01-06 is Saturday
    expect(isTradingTime(new Date('2024-01-06T15:00:00Z'))).toBe(false);
  });

  test('Test Case 11: getStockPool', () => {
    process.env.STOCK_POOL = 'SPY.US,AAPL.US,TSLA.US';
    expect(getStockPool()).toEqual(['SPY.US', 'AAPL.US', 'TSLA.US']);
    delete process.env.STOCK_POOL;
  });
});
