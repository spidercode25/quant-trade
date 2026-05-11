import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  BACKTEST_REPORT_OUTPUT_DIR,
  createBacktestReport,
  generateBacktestReportFilename,
  writeBacktestReportMarkdown,
} from '../../src/reporting';
import type { OHLC } from '../../src/strategy/TurtleIndicators';

const fixedNow = new Date('2024-01-08T14:45:00.000Z');

const mockLongbridgeInstance = {
  init: jest.fn(),
  getHistoryCandlesticks: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const repoRoot = process.cwd();

jest.mock('../../src/exchange/LongbridgeService', () => ({
  LongbridgeService: jest.fn().mockImplementation(() => mockLongbridgeInstance),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: mockLogger,
}));

function installFixedDate(now: Date): () => void {
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(...args: [] | [number] | [string] | [number, number] | [number, number, number] | [number, number, number, number] | [number, number, number, number, number] | [number, number, number, number, number, number] | [number, number, number, number, number, number, number]) {
      switch (args.length) {
        case 0:
          super(now.getTime());
          return;
        case 1:
          super(args[0]);
          return;
        case 2:
          super(args[0], args[1]);
          return;
        case 3:
          super(args[0], args[1], args[2]);
          return;
        case 4:
          super(args[0], args[1], args[2], args[3]);
          return;
        case 5:
          super(args[0], args[1], args[2], args[3], args[4]);
          return;
        case 6:
          super(args[0], args[1], args[2], args[3], args[4], args[5]);
          return;
        default:
          super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
      }
    }

    static now(): number {
      return now.getTime();
    }
  }

  Object.setPrototypeOf(MockDate, RealDate);
  global.Date = MockDate as unknown as DateConstructor;

  return () => {
    global.Date = RealDate;
  };
}

function buildHistory(length: number, mode: 'flat' | 'volatile'): OHLC[] {
  const breakoutTail = [150, 160, 150, 160, 150, 160, 150, 160, 150, 160, 170, 180, 190, 180, 190];

  return Array.from({ length }, (_, index) => {
    const close = mode === 'volatile'
      ? (index < length - 16
        ? (index % 2 === 0 ? 50 : 150)
        : (index < length - 1 ? breakoutTail[index - (length - 16)] : 200))
      : 100;

    return {
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      time: new Date(Date.UTC(2023, 0, 1 + index)),
    };
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await fileExists(filePath)) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

describe('reporting integrations', () => {
  let tempDir: string;
  let restoreDate: (() => void) | undefined;
  let cwdSpy: jest.SpiedFunction<typeof process.cwd> | undefined;
  const originalStockPool = process.env.STOCK_POOL;

  beforeEach(async () => {
    jest.resetModules();
    mockLongbridgeInstance.init.mockReset();
    mockLongbridgeInstance.getHistoryCandlesticks.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
    process.exitCode = undefined;

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quant-trader-reporting-'));
    restoreDate = installFixedDate(fixedNow);
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    cwdSpy?.mockRestore();
    restoreDate?.();
    process.env.STOCK_POOL = originalStockPool;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('writes a success report under a temp backtests directory', async () => {
    process.env.STOCK_POOL = 'SPY.US';
    mockLongbridgeInstance.init.mockResolvedValue(undefined);
    mockLongbridgeInstance.getHistoryCandlesticks.mockImplementation(async (symbol: string) => {
      if (symbol === 'SPY.US') {
        return buildHistory(211, 'volatile');
      }

      return [];
    });

    const expectedFilename = path.basename(generateBacktestReportFilename({
      generatedAtUtc: fixedNow,
      entrypoint: 'backtest',
      symbols: ['SPY.US'],
    }));
    const reportPath = path.join(tempDir, BACKTEST_REPORT_OUTPUT_DIR, expectedFilename);
    const rootReportPath = path.join(repoRoot, BACKTEST_REPORT_OUTPUT_DIR, expectedFilename);

    await import('../../src/backtest');
    await waitForFile(reportPath);
    await new Promise(resolve => setImmediate(resolve));

    const markdown = await fs.readFile(reportPath, 'utf8');
    expect(markdown).toContain('Status: success');
    expect(markdown).toContain('Outcome: all symbol runs completed successfully');
    expect(markdown).toContain('| Symbol | Status | Window | Trades | Ending Capital | PnL |');
    expect(markdown).toContain('BUY');
    expect(path.resolve(reportPath)).toContain(path.resolve(tempDir));
    expect(await fileExists(rootReportPath)).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  test('writes a no-trades report under a temp backtests directory', async () => {
    process.env.STOCK_POOL = 'SPY.US';
    mockLongbridgeInstance.init.mockResolvedValue(undefined);
    mockLongbridgeInstance.getHistoryCandlesticks.mockImplementation(async (symbol: string) => {
      if (symbol === 'SPY.US') {
        return buildHistory(100, 'flat');
      }

      return [];
    });

    const expectedFilename = path.basename(generateBacktestReportFilename({
      generatedAtUtc: fixedNow,
      entrypoint: 'backtest',
      symbols: ['SPY.US'],
    }));
    const reportPath = path.join(tempDir, BACKTEST_REPORT_OUTPUT_DIR, expectedFilename);
    const rootReportPath = path.join(repoRoot, BACKTEST_REPORT_OUTPUT_DIR, expectedFilename);

    await import('../../src/backtest');
    await waitForFile(reportPath);
    await new Promise(resolve => setImmediate(resolve));

    const markdown = await fs.readFile(reportPath, 'utf8');
    expect(markdown).toContain('Status: no-trades');
    expect(markdown).toContain('Outcome: completed without generating trades');
    expect(markdown).toContain('_No recent trades._');
    expect(await fileExists(rootReportPath)).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  test('writes a failed report under a temp backtests directory', async () => {
    const failedReport = createBacktestReport({
      status: 'failed',
      entrypoint: 'backtest',
      generatedAtUtc: fixedNow.toISOString(),
      resolvedStockPool: ['SPY.US'],
      initialCapital: 10000,
      dateWindowsBySymbol: [
        {
          symbol: 'SPY.US',
          startDateUtc: '2023-01-01',
          endDateUtc: '2023-04-01',
        },
      ],
      perSymbolResults: [
        {
          status: 'failed',
          symbol: 'SPY.US',
          window: {
            symbol: 'SPY.US',
            startDateUtc: '2023-01-01',
            endDateUtc: '2023-04-01',
          },
          reason: 'mock init failed',
        },
      ],
      failure: {
        message: 'mock init failed',
        reason: 'init failure',
      },
    });

    const expectedFilename = path.basename(generateBacktestReportFilename({
      generatedAtUtc: fixedNow,
      entrypoint: 'backtest',
      symbols: ['SPY.US'],
    }));
    const reportPath = path.join(tempDir, BACKTEST_REPORT_OUTPUT_DIR, expectedFilename);
    const rootReportPath = path.join(repoRoot, BACKTEST_REPORT_OUTPUT_DIR, expectedFilename);

    const writtenPath = await writeBacktestReportMarkdown({
      ...failedReport,
      symbolTradesBySymbol: {
        'SPY.US': [],
      },
      diagnostics: ['SPY.US: init failed before data fetch'],
    });

    expect(writtenPath).toBe(reportPath);

    const markdown = await fs.readFile(reportPath, 'utf8');
    expect(markdown).toContain('Status: failed');
    expect(markdown).toContain('Outcome: run failed before completing all symbols');
    expect(markdown).toContain('Failure details');
    expect(markdown).toContain('mock init failed');
    expect(await fileExists(rootReportPath)).toBe(false);
  });

  test('advances filename collisions with a stable suffix', () => {
    const seen: string[] = [];
    const filename = generateBacktestReportFilename({
      generatedAtUtc: fixedNow,
      entrypoint: 'backtest',
      symbols: ['SPY.US', 'AAPL.US'],
      exists: candidate => {
        seen.push(candidate);
        return candidate.endsWith('.md') && seen.length < 3;
      },
    });

    expect(filename).toBe('reports/backtests/20240108-144500-000__backtest__multi-2__n2.md');
    expect(seen).toEqual([
      'reports/backtests/20240108-144500-000__backtest__multi-2.md',
      'reports/backtests/20240108-144500-000__backtest__multi-2__n1.md',
      'reports/backtests/20240108-144500-000__backtest__multi-2__n2.md',
    ]);
  });
});
