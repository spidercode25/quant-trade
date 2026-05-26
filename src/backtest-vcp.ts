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
import { calculateMansfieldRS } from './strategy/VcpIndicators';
import { generateVcpSignal, type VcpSignalParams } from './strategy/VcpStrategy';

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

  // Calculate 52-week high (highest high in last 252 trading days)
  const get52WeekHigh = (idx: number): number => {
    const lookback = Math.min(252, idx);
    const candles = history.slice(Math.max(0, idx - lookback), idx);
    return Math.max(...candles.map(c => c.high));
  };

  // Calculate 20-day high (highest high in last 20 trading days, for momentum breakout)
  const get20DayHigh = (idx: number): number => {
    const lookback = Math.min(20, idx);
    const candles = history.slice(Math.max(0, idx - lookback), idx);
    return Math.max(...candles.map(c => c.high));
  };

      for (let i = 210; i < history.length; i += 1) {
        const candlesToDate = history.slice(0, i);
        const yesterday = candlesToDate[candlesToDate.length - 1];
        const today = history[i];

        // Update highest price since entry for trailing stop
        if (position.units > 0) {
          position.updateHighestPrice(today.high);
        }

        // Calculate indicators using data up to yesterday (avoid lookahead bias)
        const closesUpToYesterday = candlesToDate.slice(0, -1).map(candle => candle.close);
        const volumesUpToYesterday = candlesToDate.slice(0, -1).map(candle => candle.volume || 0);

        const trValues: number[] = [];
        for (let j = 1; j < closesUpToYesterday.length + 1; j += 1) {
          trValues.push(calculateTR(candlesToDate[j], candlesToDate[j - 1].close));
        }

        const atr = calculateATR(trValues.slice(-14));
        const ema21 = calculateEMA(closesUpToYesterday, 21);
        const ema50 = calculateEMA(closesUpToYesterday, 50);
        const ema200 = calculateEMA(closesUpToYesterday, 200);
        const volatility = calculateVolatility(closesUpToYesterday, 60);

        // Debug EMA values for specific dates
        const debugDateKey = toDateKey(yesterday.time);
        if (debugDateKey === '2026-04-01' || debugDateKey === '2026-04-02') {
          // Also calculate EMA including today's close for comparison
          const closesIncludingToday = [...closesUpToYesterday, today.close];
          const ema21WithToday = calculateEMA(closesIncludingToday, 21);
          const ema50WithToday = calculateEMA(closesIncludingToday, 50);
          logger.info(`[EMA DEBUG] ${debugDateKey}: my_ema21=${ema21.toFixed(2)}, my_ema50=${ema50.toFixed(2)}, with_today_ema21=${ema21WithToday.toFixed(2)}, with_today_ema50=${ema50WithToday.toFixed(2)}`);
        }

        // VMA20 and yesterday's volume for filters
        const vma20 = calculateSMA(volumesUpToYesterday, 20);
        const vma5 = calculateSMA(volumesUpToYesterday.slice(-5), 5); // For TP exhaustion candle
        const yesterdayVolume = yesterday.volume || 0;
        const todayVolume = today.volume || 0;

  // EMA21 slope calculation
  const ema21Yesterday = closesUpToYesterday.length >= 21
    ? calculateEMA(closesUpToYesterday.slice(0, -1), 21)
    : ema21;
  const ema21Slope = ema21Yesterday > 0 ? (ema21 - ema21Yesterday) / ema21Yesterday : 0;

  // Debug slope for specific dates (use today's date for clarity)
  const todayDateKey = toDateKey(today.time);
  if (todayDateKey === '2026-04-01' || todayDateKey === '2026-04-02') {
    logger.info(`[SLOPE DEBUG] ${todayDateKey}: ema21=${ema21.toFixed(2)}, ema21Yesterday=${ema21Yesterday.toFixed(2)}, slope=${ema21Slope.toFixed(6)}`);
  }

  // EMA50 slope calculation
  const ema50Yesterday = closesUpToYesterday.length >= 50
    ? calculateEMA(closesUpToYesterday.slice(0, -1), 50)
    : ema50;
  const ema50Slope = ema50Yesterday > 0 ? (ema50 - ema50Yesterday) / ema50Yesterday : 0;

  // Debug: log trend + ignition state around key windows
  const slopeDebugDate = toDateKey(today.time);
  const inDebugWindow = (slopeDebugDate >= '2025-07-22' && slopeDebugDate <= '2025-09-15')
    || (slopeDebugDate >= '2025-09-15' && slopeDebugDate <= '2025-10-15')
    || (slopeDebugDate >= '2025-11-15' && slopeDebugDate <= '2025-12-10');
  if (inDebugWindow) {
    const isBullish = today.close > today.open;
    const volRatio = vma5 > 0 ? (todayVolume / vma5).toFixed(2) : 'N/A';
    const ignitionThreshold = (1.5 * vma5).toFixed(0);
    logger.info(`[TREND-WINDOW] ${slopeDebugDate}: close=${today.close.toFixed(2)} open=${today.open.toFixed(2)} vol=${todayVolume} vma5=${vma5.toFixed(0)} vol/vma5=${volRatio} ignitionThreshold=${ignitionThreshold} bullish=${isBullish} ema21=${ema21.toFixed(2)} ema50=${ema50.toFixed(2)} ema200=${ema200.toFixed(2)} slope=${ema21Slope.toFixed(6)} ema50Slope=${ema50Slope.toFixed(6)} trend=${position.currentTrend} upDays=${position.uptrendDays} downDays=${position.downtrendDays} ignition=${position.ignitionCandleDetected} ignitionDate=${position.ignitionCandleDate ?? 'none'}`);
  }

        // VWAP calculation (simplified: use yesterday's typical price * volume weighted average)
        const vwapPeriod = Math.min(20, volumesUpToYesterday.length);
        const recentCandles = candlesToDate.slice(-vwapPeriod);
        let vwapSum = 0;
        let volumeSum = 0;
        for (const c of recentCandles) {
          const typicalPrice = (c.high + c.low + c.close) / 3;
          const vol = c.volume || 0;
          vwapSum += typicalPrice * vol;
          volumeSum += vol;
        }
        const vwap = volumeSum > 0 ? vwapSum / volumeSum : today.open;

        // ORH: Use yesterday's high as opening range high (simplified for daily data)
        const orh = yesterday.high;

        // RS calculation
        const aligned = alignBenchmarkPrices(candlesToDate, benchmarkByDate);
        const rsPeriod = Math.min(200, Math.max(1, aligned.stockPrices.length - 1));
        const rs =
          aligned.stockPrices.length > 1
            ? calculateMansfieldRS(aligned.stockPrices, aligned.benchmarkPrices, rsPeriod)
            : 0;

        // Check for exits first (before entry)
        if (position.units > 0) {
          const high52Week = get52WeekHigh(i);
          const signalParams: VcpSignalParams = {
            position,
            price: today.open,
            open: today.open,
            close: today.close,
            high: today.high,
            low: today.low,
            ema21,
            ema50,
            ema200,
            atr,
            volume: todayVolume,
            vma20,
            vma5,
            yesterdayVolume,
            orh,
            ema21Slope,
            ema50Slope,
            vwap,
    highestPriceSinceEntry: position.highestPriceSinceEntry,
    high52Week,
    high20Day: get20DayHigh(i),
    date: toDateKey(today.time),
            isLive: false, // Backtest mode - no 15-min confirmation
          };

          const exitSignal = generateVcpSignal(signalParams);

          if (exitSignal.action === 'sell') {
            const exitPrice = today.open;

            const sharesToSell = position.totalShares;
            if (sharesToSell > 0) {
              cash += sharesToSell * exitPrice;
              trades.push({
                date: toDateKey(today.time),
                action: 'SELL',
                price: exitPrice,
                units: sharesToSell,
                reason: exitSignal.reason,
                cashLeft: cash,
              });
              position.clear();
              continue;
            }
          }
        }

        // Entry signal
        const high52Week = get52WeekHigh(i);
        const signalParams: VcpSignalParams = {
          position,
          price: today.close, // Use close price for stop-loss check
          open: today.open,
          close: today.close,
          high: today.high,
          low: today.low,
          ema21,
          ema50,
          ema200,
          atr,
          volume: todayVolume,
          vma20,
          vma5,
          yesterdayVolume,
          orh,
          ema21Slope,
          ema50Slope,
          vwap,
  highestPriceSinceEntry: position.highestPriceSinceEntry,
  high52Week,
  high20Day: get20DayHigh(i),
  date: toDateKey(today.time),
          isLive: false,
        };

        const signal = generateVcpSignal(signalParams);

  // Debug: log filter status for specific dates
  const dateKey = toDateKey(today.time);
  const debugDates = ['2026-04-15', '2025-09-11', '2025-08-05', '2025-10-01', '2025-09-30', '2025-10-02'];
  if (debugDates.includes(dateKey)) {
    const isUptrend = position.currentTrend === 'uptrend';
    const isDowntrend = position.currentTrend === 'downtrend';
    logger.info(`[DEBUG-ENTRY] ${dateKey}: price=${today.close.toFixed(2)} open=${today.open.toFixed(2)} ema21=${ema21.toFixed(2)} ema50=${ema50.toFixed(2)} ema200=${ema200.toFixed(2)} slope=${ema21Slope.toFixed(6)} ignitionCandle=${position.ignitionCandleDetected} ignitionDate=${position.ignitionCandleDate ?? 'none'} trend=${position.currentTrend} upDays=${position.uptrendDays} downDays=${position.downtrendDays} isUptrend=${isUptrend}`);
    logger.info(`[DEBUG-ENTRY-CONDS] ${dateKey}: ignitionCandle=${position.ignitionCandleDetected} price>ema21=${today.close > ema21} price>ema200=${today.close > ema200} slope>0=${ema21Slope > 0} ema21>ema50=${ema21 > ema50} ALL_MET=${position.ignitionCandleDetected && today.close > ema21 && today.close > ema200 && ema21Slope > 0 && ema21 > ema50}`);
  }

        if (signal.action === 'buy') {
          const currentHoldingsValue = position.totalShares * today.open;
          const totalAccountValue = cash + currentHoldingsValue;
          const sharesToBuyPerUnit = calculateUnitSize(totalAccountValue, atr, volatility, symbol);
          const sharesToBuy = signal.suggestedUnits ? sharesToBuyPerUnit * signal.suggestedUnits : sharesToBuyPerUnit;
  const executionPrice = signal.reason === 'downtrend_bottom_fishing_entry'
    ? today.open // Downtrend entry uses market price
    : signal.reason === 'uptrend_momentum_breakout_entry'
      ? today.open // Momentum breakout uses market price (next day open)
      : Math.max(today.open, orh); // Uptrend pullback entry uses ORH breakout price

          if (sharesToBuy > 0) {
            const cost = sharesToBuy * executionPrice;
            if (cash >= cost) {
              const actionLabel = position.units === 0 ? 'BUY' : 'BUY_ADD';
              cash -= cost;
              position.addUnit(executionPrice, sharesToBuy, executionPrice - 2 * atr, rs, orh, signal.ema21 ?? ema21);
              position.updateHighestPrice(executionPrice);
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
        }
      }

      const lastClose = history[history.length - 1].close;
      const finalHoldingsValue = position.totalShares * lastClose;
      const finalNetAsset = cash + finalHoldingsValue;
      const pnl = finalNetAsset - initialCapital;
      const pnlPercent = (pnl / initialCapital) * 100;

      diagnostics.push(`${symbol}: window=${startDate}→${endDate}, finalCash=$${cash.toFixed(2)}, holdingsValue=$${finalHoldingsValue.toFixed(2)}, finalNetAsset=$${finalNetAsset.toFixed(2)}, pnl=$${pnl.toFixed(2)}, pnlPercent=${pnlPercent.toFixed(2)}%, tradeCount=${trades.length}`);
      logger.info(`[TRADES] ${symbol}: ${trades.length} trades`);
      trades.forEach((t, i) => {
        logger.info(`  Trade ${i + 1}: ${t.date} ${t.action} @ $${t.price.toFixed(2)} - ${t.reason}`);
      });
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
