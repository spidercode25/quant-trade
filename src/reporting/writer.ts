import fs from 'fs/promises';
import path from 'path';
import { generateBacktestReportFilename } from './filename';
import { BACKTEST_REPORT_OUTPUT_DIR, type BacktestReport } from './types';
import { renderBacktestReportMarkdown, type BacktestReportMarkdownInput } from './renderer';

export interface WriteBacktestReportOptions {
  readonly baseDir?: string;
  readonly outputDir?: string;
  readonly filename?: string;
}

/**
 * Renders and writes a backtest report to disk.
 */
export async function writeBacktestReportMarkdown(
  report: BacktestReportMarkdownInput,
  options: WriteBacktestReportOptions = {},
): Promise<string> {
  const baseDir = options.baseDir ?? process.cwd();
  const outputDir = options.outputDir ?? BACKTEST_REPORT_OUTPUT_DIR;
  const relativeFilename = options.filename ?? generateBacktestReportFilename({
    generatedAtUtc: new Date(report.generatedAtUtc),
    entrypoint: report.entrypoint,
    symbols: report.resolvedStockPool,
  });

  const absoluteOutputDir = path.resolve(baseDir, outputDir);
  const absoluteFilePath = path.resolve(baseDir, outputDir, path.basename(relativeFilename));
  const markdown = renderBacktestReportMarkdown(report);

  await fs.mkdir(absoluteOutputDir, { recursive: true });
  await fs.writeFile(absoluteFilePath, markdown, { encoding: 'utf8' });

  return absoluteFilePath;
}
