import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { writeBacktestReportMarkdown } from '../../src/reporting';

describe('writeBacktestReportMarkdown', () => {
  test('creates the output directory and writes utf-8 markdown', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reporting-writer-'));

    const filePath = await writeBacktestReportMarkdown({
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
          tradeCount: 1,
          endingCapital: 10100,
          pnl: 100,
        },
      ],
      symbolTradesBySymbol: {
        'SPY.US': [
          { date: '2025-02-01', action: 'buy', price: 100, units: 10, reason: 'breakout', cashLeft: 9000 },
        ],
      },
    }, {
      baseDir: tempRoot,
    });

    expect(filePath.startsWith(tempRoot)).toBe(true);
    const markdown = await fs.readFile(filePath, 'utf8');
    expect(markdown).toContain('# Backtest Report');
    expect(await fs.stat(path.dirname(filePath))).toBeTruthy();
  });

  test('surfaces write failures from an invalid output destination', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reporting-writer-fail-'));
    const blockedDestination = path.join(tempRoot, 'blocked');
    await fs.writeFile(blockedDestination, 'file-not-a-directory', 'utf8');

    await expect(writeBacktestReportMarkdown({
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
          tradeCount: 1,
          endingCapital: 10100,
          pnl: 100,
        },
      ],
    }, {
      baseDir: tempRoot,
      outputDir: blockedDestination,
      filename: 'report.md',
    })).rejects.toThrow();
  });
});
