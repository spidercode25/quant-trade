import dotenv from 'dotenv';
import { AdjustType, Period, TradeSessions } from 'longport';
import { LongbridgeService } from './exchange/LongbridgeService';
import { VcpPosition } from './models/VcpPosition';
import {
  createBacktestReport,
  writeBacktestReportMarkdown,
  type BacktestDateWindow,
  type BacktestSymbolResult,
} from './reporting';
import { getRequestedVcpStocks } from './config/stockConfig';
import { logger } from './utils/logger';
import { calculateUnitSize } from './strategy/TurtleStrategy';
import {
  calculateATR,
  calculateEMA,
  calculateSMA,
  calculateTR,
  calculateVolatility,
} from './strategy/TurtleIndicators';
import { calculateBollingerBandwidth, calculateMansfieldRS } from './strategy/VcpIndicators';
import { generateVcpSignal } from './strategy/VcpStrategy';

dotenv.config();

interface DailyCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: Date;
}

type TradeSummary = {
  date: string;
  action: string;
  price: number;
  units: number;
  reason: string;
  cashLeft: number;
};

function toDateKey(time: Date): string {
  return time.toISOString().split('T')[0];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

async function getDailyHistoryWithVolume(service: LongbridgeService, symbol: string, days: number): Promise<DailyCandle[]> {
  const quoteCtx = (service as any).quoteCtx as {
    candlesticks: typeof import('longport').QuoteContext.prototype.candlesticks;
  } | undefined;

  if (!quoteCtx) {
    throw new Error('QuoteContext not initialized');
  }

  const candles = await quoteCtx.candlesticks(
    symbol,
    Period.Day,
    days,
    AdjustType.NoAdjust,
    TradeSessions.All,
  );

  return candles.map((candle: any) => ({
    open: toNumber(candle.open),
    high: toNumber(candle.high),
    low: toNumber(candle.low),
    close: toNumber(candle.close),
    volume: toNumber(candle.volume),
    time: candle.timestamp,
  }));
}

function alignBenchmarkPrices(stockCandles: DailyCandle[], benchmarkByDate: ReadonlyMap<string, number>) {
  const stockPrices: number[] = [];
  const benchmarkPrices: number[] = [];

  for (const candle of stockCandles) {
    const benchmarkPrice = benchmarkByDate.get(toDateKey(candle.time));
    if (benchmarkPrice === undefined) {
      continue;
    }

    stockPrices.push(candle.close);
    benchmarkPrices.push(benchmarkPrice);
  }

  return { stockPrices, benchmarkPrices };
}

async function runBacktestVcp() {
  logger.info('=== 开始 VCP 策略历史回测 ===');
  const service = new LongbridgeService();
  await service.init();

  const symbols = getRequestedVcpStocks();
  const initialCapital = 10000;
  const generatedAtUtc = new Date().toISOString();
  const dateWindowsBySymbol: BacktestDateWindow[] = [];
  const perSymbolResults: BacktestSymbolResult[] = [];
  const symbolTradesBySymbol: Record<string, TradeSummary[]> = {};
  const diagnostics: string[] = [];
  let runError: unknown;

  try {
    logger.info('拉取 SPY.US 基准日线数据...');
    const benchmarkHistory = await getDailyHistoryWithVolume(service, 'SPY.US', 500);
    const benchmarkByDate = new Map<string, number>(
      benchmarkHistory.map(candle => [toDateKey(candle.time), candle.close]),
    );

    for (const symbol of symbols) {
      logger.info(`\n--- 标的: ${symbol} ---`);
      let cash = initialCapital;
      const position = new VcpPosition(symbol);
      const trades: TradeSummary[] = [];
      symbolTradesBySymbol[symbol] = trades;

      logger.info('正在拉取历史数据...');
      const history = await getDailyHistoryWithVolume(service, symbol, 500);

      const startDate = history.length > 0 ? toDateKey(history[0].time) : 'n/a';
      const endDate = history.length > 0 ? toDateKey(history[history.length - 1].time) : 'n/a';
      const window: BacktestDateWindow = {
        symbol,
        startDateUtc: startDate,
        endDateUtc: endDate,
      };
      dateWindowsBySymbol.push(window);

      if (history.length < 210) {
        logger.warn(`${symbol} 历史数据不足`);
        diagnostics.push(`${symbol}: window=${startDate}→${endDate}, finalCash=$${cash.toFixed(2)}, holdingsValue=$0.00, finalNetAsset=$${cash.toFixed(2)}, pnl=$0.00, pnlPercent=0.00%, tradeCount=0`);
        perSymbolResults.push({
          status: 'success',
          symbol,
          window,
          tradeCount: 0,
          endingCapital: cash,
          pnl: 0,
        });
        continue;
      }

      logger.info(`获取到 ${history.length} 天的历史数据，从 ${startDate} 到 ${endDate}`);

      for (let i = 210; i < history.length; i += 1) {
        const candlesToDate = history.slice(0, i);
        const today = history[i];
        const currentPrice = today.open;
        const closes = candlesToDate.map(candle => candle.close);
        const volumes = candlesToDate.map(candle => candle.volume || 0);
        const yesterdayVolume = candlesToDate[candlesToDate.length - 1].volume || 0;
        const donchian20Upper = Math.max(...candlesToDate.slice(-20).map(candle => candle.high));

        const trValues: number[] = [];
        for (let j = 1; j < candlesToDate.length; j += 1) {
          trValues.push(calculateTR(candlesToDate[j], candlesToDate[j - 1].close));
        }

        const atr = calculateATR(trValues.slice(-14));
        const sma50 = calculateSMA(closes, 50);
        const sma150 = calculateSMA(closes, 150);
        const sma200 = calculateSMA(closes, 200);
        const ema21 = calculateEMA(closes, 21);
        const volatility = calculateVolatility(closes, 60);

        const bandwidth = calculateBollingerBandwidth(closes, 20);

        // Calculate volumes for VOL-TDX
        const vma5 = calculateSMA(volumes, 5);
        const vma10 = calculateSMA(volumes, 10);
        const currentVolume = yesterdayVolume;

        // align benchmark dates
        const aligned = alignBenchmarkPrices(candlesToDate, benchmarkByDate);
        const rsPeriod = Math.min(200, Math.max(1, aligned.stockPrices.length - 1));
        const rs =
          aligned.stockPrices.length > 1
            ? calculateMansfieldRS(aligned.stockPrices, aligned.benchmarkPrices, rsPeriod)
            : 0;

        if (position.units > 0 && position.stopLossPrice > 0 && today.low <= position.stopLossPrice) {
          const exitPrice = Math.min(today.open, position.stopLossPrice);
          cash += position.totalShares * exitPrice;
          trades.push({
            date: toDateKey(today.time),
            action: 'SELL',
            price: exitPrice,
            units: position.totalShares,
            reason: 'stop_loss_hit',
            cashLeft: cash,
          });
          position.clear();
          continue;
        }

        const signal = generateVcpSignal(
          position,
          currentPrice,
          ema21,
          sma50,
          sma150,
          sma200,
          donchian20Upper,
          atr,
          rs,
          bandwidth,
          0,
          currentVolume,
          vma5,
          vma10,
        );

        if (signal.action === 'buy') {
          const currentHoldingsValue = position.totalShares * currentPrice;
          const totalAccountValue = cash + currentHoldingsValue;
          const sharesToBuyPerUnit = calculateUnitSize(totalAccountValue, atr, volatility, symbol);
          const sharesToBuy = signal.suggestedUnits ? sharesToBuyPerUnit * signal.suggestedUnits : sharesToBuyPerUnit;
          const executionPrice = Math.max(today.open, donchian20Upper);

          if (sharesToBuy > 0) {
            const cost = sharesToBuy * executionPrice;
            if (cash >= cost) {
              const actionLabel = position.units === 0 ? 'BUY' : 'BUY_ADD';
              cash -= cost;
              position.addUnit(executionPrice, sharesToBuy, executionPrice * 0.92, rs, 0);
              trades.push({
                date: toDateKey(today.time),
                action: actionLabel,
                price: executionPrice,
                units: sharesToBuy,
                reason: signal.reason,
                cashLeft: cash,
              });
            }
          }
        } else if (signal.action === 'sell' && position.totalShares > 0) {
          const proportion = signal.sellProportion ?? 1.0;
          const sharesToSell = Math.floor(position.totalShares * proportion);

          if (sharesToSell > 0) {
            cash += sharesToSell * currentPrice;
            trades.push({
              date: toDateKey(today.time),
              action: proportion >= 1 ? 'SELL' : 'SELL_PARTIAL',
              price: currentPrice,
              units: sharesToSell,
              reason: signal.reason,
              cashLeft: cash,
            });

            if (proportion >= 1) {
              position.clear();
            } else {
              position.adjustForPartialSell(proportion);
            }
          }
        }
      }

      const lastClose = history[history.length - 1].close;
      const finalHoldingsValue = position.totalShares * lastClose;
      const finalNetAsset = cash + finalHoldingsValue;
      const pnl = finalNetAsset - initialCapital;
      const pnlPercent = (pnl / initialCapital) * 100;

      diagnostics.push(`${symbol}: window=${startDate}→${endDate}, finalCash=$${cash.toFixed(2)}, holdingsValue=$${finalHoldingsValue.toFixed(2)}, finalNetAsset=$${finalNetAsset.toFixed(2)}, pnl=$${pnl.toFixed(2)}, pnlPercent=${pnlPercent.toFixed(2)}%, tradeCount=${trades.length}`);
      perSymbolResults.push({
        status: 'success',
        symbol,
        window,
        tradeCount: trades.length,
        endingCapital: finalNetAsset,
        pnl,
      });
    }
  } catch (error) {
    runError = error;
    logger.error('VCP 回测失败:', error);
  }

  const allZeroTrades = perSymbolResults.length > 0
    && perSymbolResults.every(result => result.status === 'success' && result.tradeCount === 0);
  const reportStatus = runError ? 'failed' : (allZeroTrades ? 'no-trades' : 'success');
  const runErrorMessage = runError instanceof Error ? runError.message : String(runError);
  const runErrorReason = runError instanceof Error
    ? (runError.stack?.split('\n').slice(0, 4).join(' | ') ?? runError.message)
    : String(runError);

  const reportInput = createBacktestReport({
    status: reportStatus,
    entrypoint: 'backtest',
    strategy: 'VCP',
    generatedAtUtc,
    resolvedStockPool: symbols,
    initialCapital,
    dateWindowsBySymbol,
    perSymbolResults: runError
      ? perSymbolResults.map(result => ({
        status: 'failed' as const,
        symbol: result.symbol,
        window: result.window,
        reason: runErrorMessage,
      }))
      : (allZeroTrades
        ? perSymbolResults.map(result => ({
          status: 'no-trades' as const,
          symbol: result.symbol,
          window: result.window,
          reason: '期间无交易产生',
        }))
        : perSymbolResults),
    failure: runError
      ? {
        message: runErrorMessage,
        reason: runErrorReason,
      }
      : undefined,
  });

  const reportPath = await writeBacktestReportMarkdown({
    ...reportInput,
    symbolTradesBySymbol,
    diagnostics,
  });
  logger.info(`VCP 回测报告已写入: ${reportPath}`);

  return runError ? 1 : 0;
}

void runBacktestVcp()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch(error => {
    logger.error('VCP 回测失败:', error);
    process.exitCode = 1;
  });
