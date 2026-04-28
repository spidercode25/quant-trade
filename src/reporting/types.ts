export const BACKTEST_REPORT_OUTPUT_DIR = 'reports/backtests' as const;

export const BACKTEST_STRATEGY_NAME = 'Turtle' as const;

export type BacktestEntrypoint = 'backtest' | 'backtest-diagnose';

export type BacktestReportStatus = 'success' | 'no-trades' | 'failed';

export interface BacktestDateWindow {
  symbol: string;
  startDateUtc: string;
  endDateUtc: string;
}

interface BacktestSymbolResultBase {
  symbol: string;
  window: BacktestDateWindow;
}

export interface BacktestSymbolSuccessResult extends BacktestSymbolResultBase {
  status: 'success';
  tradeCount: number;
  endingCapital: number;
  pnl: number;
}

export interface BacktestSymbolNoTradesResult extends BacktestSymbolResultBase {
  status: 'no-trades';
  reason: string;
}

export interface BacktestSymbolFailedResult extends BacktestSymbolResultBase {
  status: 'failed';
  reason: string;
}

export type BacktestSymbolResult =
  | BacktestSymbolSuccessResult
  | BacktestSymbolNoTradesResult
  | BacktestSymbolFailedResult;

interface BacktestReportBase {
  entrypoint: BacktestEntrypoint;
  generatedAtUtc: string;
  strategyName: typeof BACKTEST_STRATEGY_NAME;
  resolvedStockPool: readonly string[];
  initialCapital: number;
  dateWindowsBySymbol: readonly BacktestDateWindow[];
  perSymbolResults: readonly BacktestSymbolResult[];
}

export interface BacktestSuccessReport extends BacktestReportBase {
  status: 'success';
  perSymbolResults: readonly BacktestSymbolSuccessResult[];
}

export interface BacktestNoTradesReport extends BacktestReportBase {
  status: 'no-trades';
  perSymbolResults: readonly BacktestSymbolNoTradesResult[];
}

export interface BacktestFailedReport extends BacktestReportBase {
  status: 'failed';
  failure: {
    message: string;
    reason: string;
  };
  perSymbolResults: readonly BacktestSymbolFailedResult[];
}

export type BacktestReport =
  | BacktestSuccessReport
  | BacktestNoTradesReport
  | BacktestFailedReport;

export interface BacktestReportInput {
  status: BacktestReportStatus;
  entrypoint: BacktestEntrypoint;
  generatedAtUtc: string;
  resolvedStockPool: readonly string[];
  initialCapital: number;
  dateWindowsBySymbol: readonly BacktestDateWindow[];
  perSymbolResults: readonly BacktestSymbolResult[];
  failure?: {
    message: string;
    reason: string;
  };
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isDateWindow(value: unknown): value is BacktestDateWindow {
  return isRecord(value)
    && typeof value.symbol === 'string'
    && typeof value.startDateUtc === 'string'
    && typeof value.endDateUtc === 'string';
}

function isSymbolResult(value: unknown): value is BacktestSymbolResult {
  if (!isRecord(value) || typeof value.symbol !== 'string' || !isDateWindow(value.window)) {
    return false;
  }

  if (value.status === 'success') {
    return typeof value.tradeCount === 'number'
      && Number.isFinite(value.tradeCount)
      && typeof value.endingCapital === 'number'
      && Number.isFinite(value.endingCapital)
      && typeof value.pnl === 'number'
      && Number.isFinite(value.pnl);
  }

  if (value.status === 'no-trades' || value.status === 'failed') {
    return typeof value.reason === 'string';
  }

  return false;
}

function normalizeDateWindow(window: BacktestDateWindow): BacktestDateWindow {
  return {
    symbol: window.symbol,
    startDateUtc: window.startDateUtc,
    endDateUtc: window.endDateUtc,
  };
}

function normalizeSymbolResult(result: BacktestSymbolResult): BacktestSymbolResult {
  const window = normalizeDateWindow(result.window);

  if (result.status === 'success') {
    return {
      status: 'success',
      symbol: result.symbol,
      window,
      tradeCount: result.tradeCount,
      endingCapital: result.endingCapital,
      pnl: result.pnl,
    };
  }

  if (result.status === 'no-trades') {
    return {
      status: 'no-trades',
      symbol: result.symbol,
      window,
      reason: result.reason,
    };
  }

  return {
    status: 'failed',
    symbol: result.symbol,
    window,
    reason: result.reason,
  };
}

/**
 * Creates a persisted backtest report while stripping any unknown fields.
 */
export function createBacktestReport(input: BacktestReportInput): BacktestReport {
  const base = {
    entrypoint: input.entrypoint,
    generatedAtUtc: input.generatedAtUtc,
    strategyName: BACKTEST_STRATEGY_NAME,
    resolvedStockPool: [...input.resolvedStockPool],
    initialCapital: input.initialCapital,
    dateWindowsBySymbol: input.dateWindowsBySymbol.map(normalizeDateWindow),
    perSymbolResults: input.perSymbolResults.map(normalizeSymbolResult),
  } as const;

  if (input.status === 'failed') {
    return {
      status: 'failed',
      ...base,
      failure: {
        message: input.failure?.message ?? 'unknown failure',
        reason: input.failure?.reason ?? 'unknown',
      },
      perSymbolResults: input.perSymbolResults.map(normalizeSymbolResult).filter((result): result is BacktestSymbolFailedResult => result.status === 'failed'),
    };
  }

  if (input.status === 'no-trades') {
    return {
      status: 'no-trades',
      ...base,
      perSymbolResults: input.perSymbolResults.map(normalizeSymbolResult).filter((result): result is BacktestSymbolNoTradesResult => result.status === 'no-trades'),
    };
  }

  return {
    status: 'success',
    ...base,
    perSymbolResults: input.perSymbolResults.map(normalizeSymbolResult).filter((result): result is BacktestSymbolSuccessResult => result.status === 'success'),
  };
}

/**
 * Validates a backtest report object.
 */
export function isBacktestReport(value: unknown): value is BacktestReport {
  if (!isRecord(value)) {
    return false;
  }

  if (value.strategyName !== BACKTEST_STRATEGY_NAME
    || (value.status !== 'success' && value.status !== 'no-trades' && value.status !== 'failed')
    || (value.entrypoint !== 'backtest' && value.entrypoint !== 'backtest-diagnose')
    || typeof value.generatedAtUtc !== 'string'
    || !isStringArray(value.resolvedStockPool)
    || typeof value.initialCapital !== 'number'
    || !Number.isFinite(value.initialCapital)
    || !Array.isArray(value.dateWindowsBySymbol)
    || !value.dateWindowsBySymbol.every(isDateWindow)
    || !Array.isArray(value.perSymbolResults)
    || !value.perSymbolResults.every(isSymbolResult)) {
    return false;
  }

  if (value.status === 'failed') {
    return isRecord(value.failure)
      && typeof value.failure.message === 'string'
      && typeof value.failure.reason === 'string';
  }

  if (value.status === 'no-trades') {
    return value.perSymbolResults.every(result => result.status === 'no-trades');
  }

  return value.perSymbolResults.every(result => result.status === 'success');
}
