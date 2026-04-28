import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { LongbridgeService } from './exchange/LongbridgeService';
import { TurtlePosition } from './models/TurtlePosition';
import { calculateTR, calculateATR, calculateSMA, calculateEMA, calculateRSI, calculateDonchianChannel, calculateVolatility, OHLC } from './strategy/TurtleIndicators';
import { generateSignal, calculateUnitSize } from './strategy/TurtleStrategy';
import { createBacktestReport, writeBacktestReportMarkdown, type BacktestDateWindow, type BacktestSymbolResult } from './reporting';

dotenv.config();

async function runDiagnosticBacktest() {
  const service = new LongbridgeService();
  const symbols = (process.env.STOCK_POOL || 'OKLO.US,HOOD.US,TSLA.US').split(',').map(s => s.trim());
  const initialCapital = 10000;
  const generatedAtUtc = new Date().toISOString();
  const dateWindowsBySymbol: BacktestDateWindow[] = [];
  const perSymbolResults: BacktestSymbolResult[] = [];
  const symbolTradesBySymbol: Record<string, Array<{ date: string; action: string; price: number; units: number; reason: string; cashLeft: number }>> = {};
  const diagnostics: string[] = [];

  let runError: unknown;

  try {
    await service.init();

    for (const symbol of symbols) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 诊断回测: ${symbol}`);
      console.log(`${'='.repeat(80)}`);

      let cash = initialCapital;
      let position = new TurtlePosition(symbol);
      const trades: Array<{ date: string; action: string; price: number; units: number; reason: string; cashLeft: number }> = [];
      symbolTradesBySymbol[symbol] = trades;

      const history = await service.getHistoryCandlesticks(symbol, 500);
      const vxxHistoryRaw = await service.getHistoryCandlesticks('VXX.US', 500);

      const vxxMap = new Map<number, OHLC>();
      vxxHistoryRaw.forEach(v => { vxxMap.set(Number(v.time), v); });

      const startDate = history.length > 0
        ? new Date(Number(history[0].time)).toISOString().split('T')[0]
        : 'n/a';
      const endDate = history.length > 0
        ? new Date(Number(history[history.length - 1].time)).toISOString().split('T')[0]
        : 'n/a';
      const window: BacktestDateWindow = {
        symbol,
        startDateUtc: startDate,
        endDateUtc: endDate,
      };
      dateWindowsBySymbol.push(window);

      if (history.length < 210) {
        console.log(`❌ ${symbol} 历史数据不足`);
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

      // 先扫描整个历史数据，记录波动率分界线变化
      console.log(`\n📅 数据范围: ${new Date(Number(history[0].time)).toISOString().split('T')[0]} → ${new Date(Number(history[history.length - 1].time)).toISOString().split('T')[0]}`);

      // 回测主循环
      for (let i = 210; i < history.length; i++) {
      const today = history[i];
      const currentPrice = today.close;
      const windowData = history.slice(0, i);

      const trValues: number[] = [];
      for (let j = 1; j < windowData.length; j++) {
        trValues.push(calculateTR(windowData[j], windowData[j - 1].close));
      }
      const recentTrs = trValues.slice(-14);
      const atr = calculateATR(recentTrs);

      const closes = windowData.map(c => c.close);
      const sma200 = calculateSMA(closes, 200);
      const sma50 = calculateSMA(closes, 50);
      const ema21 = calculateEMA(closes, 21);
      const rsi14 = calculateRSI(closes, 14);
      const volatility = calculateVolatility(closes, 60);

      const highs = windowData.map(c => c.high);
      const lows = windowData.map(c => c.low);
      const donchian20 = calculateDonchianChannel(highs, lows, 20);
      const donchian10 = calculateDonchianChannel(highs, lows, 10);

      // VXX 恐慌判断
      let isMarketPanic = false;
      const todayTime = Number(today.time);
      const vxxWindowData = vxxHistoryRaw.filter(v => Number(v.time) < todayTime);
      if (vxxWindowData.length >= 10) {
        const currentVxxOHLC = vxxMap.get(todayTime);
        const vxxCurrentPrice = currentVxxOHLC ? currentVxxOHLC.close : vxxWindowData[vxxWindowData.length - 1].close;
        const vxxCloses = vxxWindowData.map(v => v.close);
        const vxxSma10 = calculateSMA(vxxCloses, 10);
        const yesterdayVxxClose = vxxCloses[vxxCloses.length - 1];
        const vxxDailyChange = yesterdayVxxClose > 0 ? (vxxCurrentPrice / yesterdayVxxClose) - 1 : 0;
        isMarketPanic = (vxxCurrentPrice > vxxSma10) || (vxxDailyChange > 0.05);
      }

      const signal = generateSignal(position, currentPrice, sma200, sma50, ema21, rsi14, donchian20, donchian10, atr, volatility, isMarketPanic);

      // ========== 诊断输出：只在卖出信号时详细输出 ==========
      if (signal.action === 'sell') {
        const dateStr = new Date(Number(today.time)).toISOString().split('T')[0];
        const branch = volatility < 0.50 ? 'A(低波动-回调)' : 'B(高波动-突破)';
        const avgCost = position.entryPrices.length > 0
          ? position.entryPrices.reduce((a: number, b: number) => a + b, 0) / position.entryPrices.length
          : 0;
        const pnlPercent = avgCost > 0 ? ((currentPrice - avgCost) / avgCost * 100) : 0;

        console.log(`\n🔴 [${dateStr}] 卖出信号: ${signal.reason} | ${branch}`);
        console.log(`   价格: $${currentPrice.toFixed(2)} | SMA200: $${sma200.toFixed(2)} | SMA50: $${sma50.toFixed(2)}`);
        console.log(`   入场均价: $${avgCost.toFixed(2)} | 持仓盈亏: ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`);
        console.log(`   止损线: $${position.stopLossPrice.toFixed(2)} | 2N距离: $${(2 * position.N).toFixed(2)} | ATR: $${atr.toFixed(2)}`);
        console.log(`   波动率: ${(volatility * 100).toFixed(1)}% | RSI14: ${rsi14.toFixed(1)} | VXX恐慌: ${isMarketPanic}`);
        console.log(`   Donchian10低: $${donchian10.lower.toFixed(2)} | 最高跟踪价: $${(position.highestPriceSinceEntry || 0).toFixed(2)}`);
        console.log(`   卖出比例: ${(signal.sellProportion || 1) * 100}% | 持仓股数: ${position.totalShares} | 已减半: ${position.hasCutHalf}`);

        // 诊断：逐条件检查
        console.log(`   ── 止损条件检查 ──`);
        console.log(`   price < SMA200? ${currentPrice < sma200} (${currentPrice.toFixed(2)} < ${sma200.toFixed(2)})`);
        console.log(`   price < stopLoss? ${currentPrice < position.stopLossPrice} (${currentPrice.toFixed(2)} < ${position.stopLossPrice.toFixed(2)})`);
        if (avgCost > 0) {
          if (volatility >= 0.50) {
            const profitTrigger = currentPrice > avgCost * 1.20;
            console.log(`   盈利>20%? ${profitTrigger} (${pnlPercent.toFixed(1)}%)`);
            if (position.highestPriceSinceEntry) {
              const trailingTrigger = currentPrice < position.highestPriceSinceEntry * 0.90;
              console.log(`   回撤10%止盈? ${trailingTrigger} (${currentPrice.toFixed(2)} < ${position.highestPriceSinceEntry.toFixed(2)} * 0.90 = ${(position.highestPriceSinceEntry * 0.90).toFixed(2)})`);
            }
          } else {
            const profitTrigger = currentPrice > avgCost * 1.05;
            console.log(`   盈利>5%? ${profitTrigger} (${pnlPercent.toFixed(1)}%)`);
            if (position.highestPriceSinceEntry) {
              const trailingTrigger = currentPrice < position.highestPriceSinceEntry * 0.98;
              console.log(`   回撤2%止盈? ${trailingTrigger} (${currentPrice.toFixed(2)} < ${position.highestPriceSinceEntry.toFixed(2)} * 0.98 = ${(position.highestPriceSinceEntry * 0.98).toFixed(2)})`);
            }
          }
        }
        console.log(`   price < DC10低? ${currentPrice < donchian10.lower} (${currentPrice.toFixed(2)} < ${donchian10.lower.toFixed(2)})`);
        console.log(`   RSI14 > 80? ${rsi14 > 80} (${rsi14.toFixed(1)})`);

        diagnostics.push(`${symbol} | date=${dateStr} | signal reason=${signal.reason} | branch=${branch} | current price=${currentPrice.toFixed(2)} | SMA200=${sma200.toFixed(2)} | SMA50=${sma50.toFixed(2)} | stop-loss price=${position.stopLossPrice.toFixed(2)} | ATR=${atr.toFixed(2)} | volatility=${(volatility * 100).toFixed(2)}% | RSI14=${rsi14.toFixed(2)} | Donchian10 lower=${donchian10.lower.toFixed(2)} | highest tracked price=${(position.highestPriceSinceEntry || 0).toFixed(2)} | sell proportion=${((signal.sellProportion || 1) * 100).toFixed(2)}%`);
      }

      // ========== 买入时也输出简要信息 ==========
      if (signal.action === 'buy') {
        const dateStr = new Date(Number(today.time)).toISOString().split('T')[0];
        const branch = volatility < 0.50 ? 'A(低波动-回调)' : 'B(高波动-突破)';
        console.log(`\n🟢 [${dateStr}] 买入信号: ${signal.reason} | ${branch}`);
        console.log(`   价格: $${currentPrice.toFixed(2)} | SMA200: $${sma200.toFixed(2)} | SMA50: $${sma50.toFixed(2)}`);
        console.log(`   波动率: ${(volatility * 100).toFixed(1)}% | RSI14: ${rsi14.toFixed(1)} | ATR: $${atr.toFixed(2)}`);
        if (signal.reason === 'breakout') {
          console.log(`   突破DC20高: $${donchian20.upper.toFixed(2)}`);
        } else if (signal.reason === 'buy_pullback') {
          console.log(`   回调至SMA50附近 (±2%): $${sma50.toFixed(2)}`);
        }

        diagnostics.push(`${symbol} | date=${dateStr} | signal reason=${signal.reason} | branch=${branch} | current price=${currentPrice.toFixed(2)} | SMA200=${sma200.toFixed(2)} | SMA50=${sma50.toFixed(2)} | stop-loss price=${position.stopLossPrice.toFixed(2)} | ATR=${atr.toFixed(2)} | volatility=${(volatility * 100).toFixed(2)}% | RSI14=${rsi14.toFixed(2)} | Donchian10 lower=${donchian10.lower.toFixed(2)} | highest tracked price=${(position.highestPriceSinceEntry || 0).toFixed(2)} | sell proportion=n/a`);
      }

      // 执行交易
      if (signal.action === 'buy') {
        const totalValue = cash + (position.units * (position.lastEntryPrice || currentPrice));
        const unitSize = calculateUnitSize(totalValue, atr, volatility);
        const unitsToTrade = signal.suggestedUnits ? unitSize * signal.suggestedUnits : unitSize;

        if (unitsToTrade > 0) {
          const cost = unitsToTrade * currentPrice;
          if (cash >= cost) {
            cash -= cost;
            position.addUnit(currentPrice, atr, unitsToTrade);
            trades.push({
              date: new Date(Number(today.time)).toISOString().split('T')[0],
              action: 'BUY',
              price: currentPrice,
              units: unitsToTrade,
              reason: signal.reason,
              cashLeft: cash
            });
          }
        }
      } else if (signal.action === 'sell' && position.units > 0) {
        const proportion = signal.sellProportion || 1.0;
        const unitsToSell = Math.floor(position.totalShares * proportion);

        if (unitsToSell > 0) {
          const revenue = unitsToSell * currentPrice;
          cash += revenue;

          trades.push({
            date: new Date(Number(today.time)).toISOString().split('T')[0],
            action: proportion === 1.0 ? 'SELL' : 'SELL_HALF',
            price: currentPrice,
            units: unitsToSell,
            reason: signal.reason,
            cashLeft: cash
          });

          if (proportion >= 1.0) {
            position.clear();
          } else {
            position.adjustForPartialSell(unitsToSell);
          }
        }
      }
    }

      // 最终结果
      const currentPrice = history[history.length - 1].close;
      let finalHoldingsValue = 0;
      if (position.units > 0) {
        finalHoldingsValue = position.totalShares * currentPrice;
      }
      const finalNetAsset = cash + finalHoldingsValue;
      const pnl = finalNetAsset - initialCapital;
      const pnlPercent = (pnl / initialCapital) * 100;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📈 最终结果 - ${symbol}`);
      console.log(`   初始资金: $${initialCapital.toFixed(2)}`);
      console.log(`   最终净值: $${finalNetAsset.toFixed(2)} | 盈亏: ${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
      console.log(`   交易次数: ${trades.length} 次`);

      // 统计止损类型
      const exitReasons: Record<string, number> = {};
      trades.filter(t => t.action.includes('SELL')).forEach(t => {
        exitReasons[t.reason] = (exitReasons[t.reason] || 0) + 1;
      });
      console.log(`   止损类型统计:`);
      Object.entries(exitReasons).forEach(([reason, count]) => {
        console.log(`     ${reason}: ${count}次`);
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
    logger.error('回测失败:', error);
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
    entrypoint: 'backtest-diagnose',
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
  logger.info(`诊断回测报告已写入: ${reportPath}`);

  return runError ? 1 : 0;
}

void runDiagnosticBacktest()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch(err => {
    console.error('回测失败:', err);
    process.exitCode = 1;
  });
