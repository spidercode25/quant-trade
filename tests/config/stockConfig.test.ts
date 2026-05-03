import {
  getHighVolOscillatoryStocks,
  getHighVolSubtype,
  getHighVolTrendStocks,
  getStockPool,
} from '../../src/config/stockConfig';

describe('stockConfig high-vol subtype routing', () => {
  const originalStockPool = process.env.STOCK_POOL;
  const originalTrend = process.env.HIGH_VOL_TREND_STOCKS;
  const originalOsc = process.env.HIGH_VOL_OSCILLATORY_STOCKS;

  afterEach(() => {
    process.env.STOCK_POOL = originalStockPool;
    process.env.HIGH_VOL_TREND_STOCKS = originalTrend;
    process.env.HIGH_VOL_OSCILLATORY_STOCKS = originalOsc;
  });

  test('filters subtype lists against STOCK_POOL and gives oscillatory precedence', () => {
    process.env.STOCK_POOL = 'COIN.US,OKLO.US,TSLA.US';
    process.env.HIGH_VOL_TREND_STOCKS = 'OKLO.US,COIN.US,FAKE.US';
    process.env.HIGH_VOL_OSCILLATORY_STOCKS = 'COIN.US,PDD.US';

    expect(getStockPool()).toEqual(['COIN.US', 'OKLO.US', 'TSLA.US']);
    expect(Array.from(getHighVolOscillatoryStocks())).toEqual(['COIN.US']);
    expect(Array.from(getHighVolTrendStocks())).toEqual(['OKLO.US']);
    expect(getHighVolSubtype('COIN.US')).toBe('oscillatory');
    expect(getHighVolSubtype('OKLO.US')).toBe('trend');
    expect(getHighVolSubtype('TSLA.US')).toBe('trend');
  });

  test('uses default subtype sets when env vars are unset', () => {
    process.env.STOCK_POOL = 'COIN.US,PDD.US,OKLO.US,RIOT.US,TSLA.US';
    delete process.env.HIGH_VOL_TREND_STOCKS;
    delete process.env.HIGH_VOL_OSCILLATORY_STOCKS;

    expect(getHighVolSubtype('COIN.US')).toBe('oscillatory');
    expect(getHighVolSubtype('PDD.US')).toBe('oscillatory');
    expect(getHighVolSubtype('OKLO.US')).toBe('trend');
    expect(getHighVolSubtype('RIOT.US')).toBe('trend');
    expect(getHighVolSubtype('TSLA.US')).toBe('trend');
  });
});
