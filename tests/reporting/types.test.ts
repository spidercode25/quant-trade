import {
  BACKTEST_STRATEGY_NAME,
  createBacktestReport,
  isBacktestReport,
} from '../../src/reporting';

describe('backtest report schema', () => {
  test('creates a complete success report and strips unknown fields', () => {
    const report = createBacktestReport({
      status: 'success',
      entrypoint: 'backtest',
      generatedAtUtc: '2026-04-28T08:09:10.011Z',
      resolvedStockPool: ['SPY.US', 'AAPL.US'],
      initialCapital: 10000,
      dateWindowsBySymbol: [
        { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
        { symbol: 'AAPL.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
      ],
      perSymbolResults: [
        {
          status: 'success',
          symbol: 'SPY.US',
          window: { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
          tradeCount: 3,
          endingCapital: 11250,
          pnl: 1250,
        },
        {
          status: 'success',
          symbol: 'AAPL.US',
          window: { symbol: 'AAPL.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
          tradeCount: 0,
          endingCapital: 10000,
          pnl: 0,
        },
      ],
      ANTHROPIC_API_KEY: 'secret',
      BINANCE_API_SECRET: 'secret',
    });

    expect(report.strategyName).toBe(BACKTEST_STRATEGY_NAME);
    expect(isBacktestReport(report)).toBe(true);
    expect(Object.keys(report)).not.toContain('ANTHROPIC_API_KEY');
    expect(Object.keys(report)).not.toContain('BINANCE_API_SECRET');
    expect(report.perSymbolResults).toHaveLength(2);
    expect(report.perSymbolResults[0].status).toBe('success');
  });

  test('creates a failed report with explicit failure details', () => {
    const report = createBacktestReport({
      status: 'failed',
      entrypoint: 'backtest-diagnose',
      generatedAtUtc: '2026-04-28T08:09:10.011Z',
      resolvedStockPool: ['SPY.US'],
      initialCapital: 10000,
      dateWindowsBySymbol: [
        { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
      ],
      perSymbolResults: [
        {
          status: 'failed',
          symbol: 'SPY.US',
          window: { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
          reason: 'data-unavailable',
        },
      ],
      failure: {
        message: 'history fetch failed',
        reason: 'data-unavailable',
      },
    });

    expect(report.status).toBe('failed');
    if (report.status === 'failed') {
      expect(report.failure.message).toBe('history fetch failed');
    }
    expect(isBacktestReport(report)).toBe(true);
  });
});
