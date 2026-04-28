import {
  BACKTEST_STRATEGY_NAME,
  type BacktestFailedReport,
  type BacktestReport,
  type BacktestSymbolResult,
} from './types';

export interface BacktestTradeSummary {
  date: string;
  action: string;
  price: number;
  units: number;
  reason: string;
  cashLeft: number;
}

export type BacktestReportMarkdownInput = BacktestReport & {
  readonly symbolTradesBySymbol?: Readonly<Record<string, readonly BacktestTradeSummary[]>>;
  readonly diagnostics?: readonly string[];
};

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatSignedCurrency(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatCurrency(value)}`;
}

function formatPercentage(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return '- None';
  }

  return items.map(item => `- ${escapeCell(item)}`).join('\n');
}

function renderTradeTable(trades: readonly BacktestTradeSummary[]): string {
  const rows = trades.slice(-10).map(trade => [
    escapeCell(trade.date),
    escapeCell(trade.action),
    escapeCell(formatCurrency(trade.price)),
    escapeCell(trade.units.toString()),
    escapeCell(trade.reason),
    escapeCell(formatCurrency(trade.cashLeft)),
  ]);

  if (rows.length === 0) {
    return '_No recent trades._';
  }

  const table = [
    '| Date | Action | Price | Units | Reason | Cash Left |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ];

  return table.join('\n');
}

function renderStatusSection(report: BacktestReport): string {
  const lines = [
    `- Status: ${report.status}`,
  ];

  if (report.status === 'success') {
    lines.push('- Outcome: all symbol runs completed successfully');
  } else if (report.status === 'no-trades') {
    lines.push('- Outcome: completed without generating trades');
  } else {
    lines.push('- Outcome: run failed before completing all symbols');
  }

  return lines.join('\n');
}

function renderSymbolSummary(result: BacktestSymbolResult): string[] {
  const summary = [`| ${escapeCell(result.symbol)} | ${escapeCell(result.status)} | ${escapeCell(`${result.window.startDateUtc} → ${result.window.endDateUtc}`)} |`];

  if (result.status === 'success') {
    summary[0] = `| ${escapeCell(result.symbol)} | ${escapeCell(result.status)} | ${escapeCell(`${result.window.startDateUtc} → ${result.window.endDateUtc}`)} | ${result.tradeCount} | ${escapeCell(formatCurrency(result.endingCapital))} | ${escapeCell(formatSignedCurrency(result.pnl))} |`;
    return summary;
  }

  summary[0] = `| ${escapeCell(result.symbol)} | ${escapeCell(result.status)} | ${escapeCell(`${result.window.startDateUtc} → ${result.window.endDateUtc}`)} | - | - | ${escapeCell(result.reason)} |`;
  return summary;
}

function renderSymbolResults(report: BacktestReport): string {
  const header = report.status === 'success'
    ? '| Symbol | Status | Window | Trades | Ending Capital | PnL |'
    : '| Symbol | Status | Window | Trades | Ending Capital | Notes |';
  const separator = report.status === 'success'
    ? '| --- | --- | --- | --- | --- | --- |'
    : '| --- | --- | --- | --- | --- | --- |';

  const rows = report.perSymbolResults.flatMap(result => renderSymbolSummary(result));

  return [header, separator, ...rows].join('\n');
}

function renderFailureSection(report: BacktestFailedReport): string {
  return [
    '## Failure details',
    `- Message: ${escapeCell(report.failure.message)}`,
    `- Reason: ${escapeCell(report.failure.reason)}`,
  ].join('\n');
}

function renderDiagnosticsSection(diagnostics: readonly string[]): string {
  return [
    '## Diagnostics appendix',
    renderList(diagnostics),
  ].join('\n');
}

/**
 * Converts a backtest report into deterministic Markdown.
 */
export function renderBacktestReportMarkdown(report: BacktestReportMarkdownInput): string {
  const lines = [
    '# Backtest Report',
    '',
    '## Run metadata',
    `- Strategy: ${BACKTEST_STRATEGY_NAME}`,
    `- Entrypoint: ${escapeCell(report.entrypoint)}`,
    `- Generated at (UTC): ${escapeCell(report.generatedAtUtc)}`,
    `- Initial capital: ${formatCurrency(report.initialCapital)}`,
    `- Stock pool size: ${report.resolvedStockPool.length}`,
    '',
    '## Run status',
    renderStatusSection(report),
    '',
    '## Stock pool',
    renderList(report.resolvedStockPool),
    '',
    '## Per-symbol summaries',
    renderSymbolResults(report),
    '',
    '## Recent trades',
  ];

  const tradesBySymbol = report.symbolTradesBySymbol ?? {};
  const tradeSections = report.resolvedStockPool.map(symbol => {
    const trades = tradesBySymbol[symbol] ?? [];
    return [
      `### ${escapeCell(symbol)}`,
      renderTradeTable(trades),
    ].join('\n');
  });

  lines.push(tradeSections.join('\n\n'));

  if (report.status === 'failed') {
    lines.push('', renderFailureSection(report));
  }

  if (report.diagnostics && report.diagnostics.length > 0) {
    lines.push('', renderDiagnosticsSection(report.diagnostics));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
