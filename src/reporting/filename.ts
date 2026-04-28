import path from 'path';
import { BACKTEST_REPORT_OUTPUT_DIR, BacktestEntrypoint } from './types';

export interface BacktestReportFilenameOptions {
  generatedAtUtc: Date;
  entrypoint: BacktestEntrypoint;
  symbols: readonly string[];
  exists?: (relativePath: string) => boolean;
}

function pad(value: number, length: number): string {
  return value.toString().padStart(length, '0');
}

function formatTimestampUtc(date: Date): string {
  return [
    date.getUTCFullYear().toString(),
    pad(date.getUTCMonth() + 1, 2),
    pad(date.getUTCDate(), 2),
  ].join('') + `-${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}-${pad(date.getUTCMilliseconds(), 3)}`;
}

function buildSymbolDescriptor(symbols: readonly string[]): string {
  if (symbols.length === 1) {
    return 'single-symbol';
  }

  return `multi-${symbols.length}`;
}

/**
 * Builds a collision-safe report path under reports/backtests/.
 */
export function generateBacktestReportFilename(options: BacktestReportFilenameOptions): string {
  if (options.symbols.length === 0) {
    throw new RangeError('symbols must not be empty');
  }

  const exists = options.exists ?? (() => false);
  const timestamp = formatTimestampUtc(options.generatedAtUtc);
  const descriptor = buildSymbolDescriptor(options.symbols);
  const baseName = `${timestamp}__${options.entrypoint}__${descriptor}`;

  let counter = 0;
  while (true) {
    const suffix = counter === 0 ? '' : `__n${counter}`;
    const candidate = path.posix.join(BACKTEST_REPORT_OUTPUT_DIR, `${baseName}${suffix}.md`);
    if (!exists(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}
