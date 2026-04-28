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
  const filenameParts = path.parse(path.basename(relativeFilename));
  const markdown = renderBacktestReportMarkdown(report);

  await fs.mkdir(absoluteOutputDir, { recursive: true });

  let counter = 0;
  while (true) {
    const suffix = counter === 0 ? '' : `__n${counter}`;
    const candidateFilename = `${filenameParts.name}${suffix}${filenameParts.ext}`;
    const absoluteFilePath = path.resolve(baseDir, outputDir, candidateFilename);

    try {
      await fs.access(absoluteFilePath);
      counter += 1;
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      await fs.writeFile(absoluteFilePath, markdown, { encoding: 'utf8', flag: 'wx' });
      return absoluteFilePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        counter += 1;
        continue;
      }

      throw error;
    }
  }
}
