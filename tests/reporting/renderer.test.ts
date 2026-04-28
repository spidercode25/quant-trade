import { renderBacktestReportMarkdown } from '../../src/reporting';

describe('renderBacktestReportMarkdown', () => {
  test('renders deterministic markdown sections in order', () => {
    const markdown = renderBacktestReportMarkdown({
      status: 'failed',
      entrypoint: 'backtest-diagnose',
      generatedAtUtc: '2026-04-28T08:09:10.011Z',
      strategyName: 'Turtle',
      resolvedStockPool: ['SPY.US', 'AAPL.US'],
      initialCapital: 10000,
      dateWindowsBySymbol: [
        { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
        { symbol: 'AAPL.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
      ],
      perSymbolResults: [
        {
          status: 'failed',
          symbol: 'SPY.US',
          window: { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
          reason: 'data-unavailable',
        },
        {
          status: 'failed',
          symbol: 'AAPL.US',
          window: { symbol: 'AAPL.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
          reason: 'data-unavailable',
        },
      ],
      failure: {
        message: 'history fetch failed',
        reason: 'data-unavailable',
      },
      symbolTradesBySymbol: {
        'SPY.US': [
          { date: '2025-02-01', action: 'buy', price: 100, units: 10, reason: 'breakout', cashLeft: 9000 },
          { date: '2025-02-02', action: 'sell', price: 110, units: 10, reason: 'take_profit', cashLeft: 10100 },
        ],
      },
      diagnostics: ['missing historical candles', 'provider timeout'],
    });

    expect(markdown).toContain('# Backtest Report');
    expect(markdown).toContain('## Run metadata');
    expect(markdown).toContain('## Run status');
    expect(markdown).toContain('## Stock pool');
    expect(markdown).toContain('## Per-symbol summaries');
    expect(markdown).toContain('## Recent trades');
    expect(markdown).toContain('## Failure details');
    expect(markdown).toContain('## Diagnostics appendix');

    const metadataIndex = markdown.indexOf('## Run metadata');
    const statusIndex = markdown.indexOf('## Run status');
    const poolIndex = markdown.indexOf('## Stock pool');
    const summaryIndex = markdown.indexOf('## Per-symbol summaries');
    const tradesIndex = markdown.indexOf('## Recent trades');
    const failureIndex = markdown.indexOf('## Failure details');
    const diagnosticsIndex = markdown.indexOf('## Diagnostics appendix');

    expect(metadataIndex).toBeLessThan(statusIndex);
    expect(statusIndex).toBeLessThan(poolIndex);
    expect(poolIndex).toBeLessThan(summaryIndex);
    expect(summaryIndex).toBeLessThan(tradesIndex);
    expect(tradesIndex).toBeLessThan(failureIndex);
    expect(failureIndex).toBeLessThan(diagnosticsIndex);
    expect(markdown).toContain('| SPY.US | failed | 2025-01-01 → 2025-12-31 | - | - | data-unavailable |');
    expect(markdown).toContain('| Date | Action | Price | Units | Reason | Cash Left |');
    expect(markdown).toContain('| 2025-02-01 | buy | $100.00 | 10 | breakout | $9000.00 |');
    expect(markdown).toContain('- Message: history fetch failed');
    expect(markdown).toContain('- Reason: data-unavailable');
  });

  test('limits recent trades to ten rows per symbol', () => {
    const trades = Array.from({ length: 12 }, (_, index) => ({
      date: `2025-02-${String(index + 1).padStart(2, '0')}`,
      action: 'buy',
      price: 100 + index,
      units: 1,
      reason: `reason-${index + 1}`,
      cashLeft: 10000 - index,
    }));

    const markdown = renderBacktestReportMarkdown({
      status: 'success',
      entrypoint: 'backtest',
      generatedAtUtc: '2026-04-28T08:09:10.011Z',
      strategyName: 'Turtle',
      resolvedStockPool: ['SPY.US'],
      initialCapital: 10000,
      dateWindowsBySymbol: [
        { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
      ],
      perSymbolResults: [
        {
          status: 'success',
          symbol: 'SPY.US',
          window: { symbol: 'SPY.US', startDateUtc: '2025-01-01', endDateUtc: '2025-12-31' },
          tradeCount: 12,
          endingCapital: 11111,
          pnl: 1111,
        },
      ],
      symbolTradesBySymbol: {
        'SPY.US': trades,
      },
    });

    expect(markdown.match(/\| buy \|/g)).toHaveLength(10);
    expect(markdown).not.toContain('2025-02-01 | buy | $100.00 | 1 | reason-1 | $10000.00 |');
    expect(markdown).toContain('2025-02-12 | buy | $111.00 | 1 | reason-12 | $9989.00 |');
  });
});
