import { generateBacktestReportFilename } from '../../src/reporting';

describe('generateBacktestReportFilename', () => {
  test('builds canonical path and appends collision suffixes', () => {
    const exists = jest.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const filename = generateBacktestReportFilename({
      generatedAtUtc: new Date(Date.UTC(2026, 3, 28, 8, 9, 10, 11)),
      entrypoint: 'backtest',
      symbols: ['SPY.US', 'AAPL.US'],
      exists,
    });

    expect(filename).toBe('reports/backtests/20260428-080910-011__backtest__multi-2__n1.md');
    expect(exists).toHaveBeenCalledWith('reports/backtests/20260428-080910-011__backtest__multi-2.md');
    expect(exists).toHaveBeenCalledWith('reports/backtests/20260428-080910-011__backtest__multi-2__n1.md');
  });

  test('uses single-symbol descriptor for one symbol', () => {
    const filename = generateBacktestReportFilename({
      generatedAtUtc: new Date(Date.UTC(2026, 3, 28, 8, 9, 10, 11)),
      entrypoint: 'backtest-diagnose',
      symbols: ['SPY.US'],
    });

    expect(filename).toBe('reports/backtests/20260428-080910-011__backtest-diagnose__single-symbol.md');
  });
});
