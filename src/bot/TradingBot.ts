import { logger } from '../utils/logger';
import { LongbridgeService } from '../exchange/LongbridgeService';
import { TurtlePosition } from '../models/TurtlePosition';
import { VcpPosition } from '../models/VcpPosition';
import {
  calculateTR, 
  calculateATR, 
  calculateSMA,
  calculateEMA,
  calculateRSI,
  predictTargetPriceForRSI,
  calculateDonchianChannel,
  calculateBollingerBands,
  calculateVolatility,
  OHLC 
} from '../strategy/TurtleIndicators';
import { generateSignal, calculateUnitSize } from '../strategy/TurtleStrategy';
import { generateVcpSignal } from '../strategy/VcpStrategy';
import { getHighVolSubtype, getStockPool as resolveStockPool, isVcpStock } from '../config/stockConfig';
import { calculateMansfieldRS, calculateBollingerBandwidth, calculateORHigh } from '../strategy/VcpIndicators';
import { Period } from 'longport';

export function isTradingTime(date: Date = new Date()): boolean {
  // Convert to EST (UTC-5)
  // Or rather use Intl.DateTimeFormat to get hour/minute in New York time
  const nyTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23'
  }).format(date);

  // Format of nyTime: "Mon, 09:45"
  const match = nyTime.match(/([a-zA-Z]+)[,\s]+(\d+):(\d+)/);
  if (!match) return false;

  const weekday = match[1];
  const hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);

  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  const timeInMinutes = hour * 60 + minute;
  // 09:45 is 9*60+45 = 585
  // 16:00 is 16*60 = 960
  
  if (process.env.FORCE_RUN === 'true') {
    logger.info('FORCE_RUN is enabled. Ignoring trading time restrictions.');
    return true; // 如果开启了 FORCE_RUN，忽略时间限制
  }

  if (timeInMinutes >= 585 && timeInMinutes < 960) {
    return true;
  }
  return false;
}

export function getStockPool(): string[] {
  return resolveStockPool();
}

export class TradingBot {
  private service: LongbridgeService;
  private positions: Map<string, TurtlePosition> = new Map();
  private vcpPositions: Map<string, VcpPosition> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.service = new LongbridgeService();
  }

  async start() {
    logger.info('Starting Trading Bot...');
    await this.service.init();
    
    this.isRunning = true;
    
    // Instead of using node-cron, we can use a loop or setInterval for simplicity
    // But since the plan explicitly says "引入 node-cron 或根据美东时间判断"
    // Let's implement a loop every minute
    this.loop();
  }

  async stop() {
    logger.info('Stopping Trading Bot...');
    this.isRunning = false;
  }

  private async loop() {
    while (this.isRunning) {
      if (isTradingTime()) {
        logger.info('检查交易时间: 交易时间段内');
        await this.tradingCycle();
        // 如果每天只执行一次，可以加个日期判断。为简化，睡眠一段时间
        // 或者睡眠1天，这取决于具体需求。这里我们假设每分钟检测一次
        await new Promise(res => setTimeout(res, 60 * 1000 * 5)); // sleep 5 mins
      } else {
        logger.info('检查交易时间: 非交易时间，休眠');
        await new Promise(res => setTimeout(res, 60 * 1000)); // sleep 1 minute
      }
    }
  }

  public async tradingCycle() {
    const symbols = getStockPool();
    logger.info(`获取股票池: ${symbols.join(', ')}`);

    // --- Market Panic Filter (VXX) ---
    let isMarketPanic = false;
    try {
      logger.info(`获取大盘恐慌指数: VXX.US`);
      const vxxHistory = await this.service.getHistoryCandlesticks('VXX.US', 20);
      if (vxxHistory.length >= 10) {
        const vxxCurrentPrice = await this.service.getCurrentPrice('VXX.US');
        const vxxCloses = vxxHistory.map(c => c.close);
        const vxxSma10 = calculateSMA(vxxCloses, 10);
        
        // Calculate daily change using yesterday's close
        const yesterdayClose = vxxCloses[vxxCloses.length - 1]; // Last complete day
        const vxxDailyChange = yesterdayClose > 0 ? (vxxCurrentPrice / yesterdayClose) - 1 : 0;
        
        isMarketPanic = (vxxCurrentPrice > vxxSma10) || (vxxDailyChange > 0.05);
        
        const panicStr = isMarketPanic ? '【Panic 恐慌模式】' : '【Normal 正常模式】';
        logger.info(`[Market State] VXX: $${vxxCurrentPrice.toFixed(2)} (SMA10: $${vxxSma10.toFixed(2)}, Change: ${(vxxDailyChange*100).toFixed(2)}%). Status: ${panicStr}`);
      } else {
        logger.warn(`VXX 数据不足，跳过恐慌过滤器`);
      }
    } catch (err) {
      logger.error(`获取 VXX 状态失败，默认关闭恐慌过滤器: `, err);
    }
    // ---------------------------------

    for (const symbol of symbols) {
      try {
        logger.info(`获取历史数据: ${symbol}`);
        // 增加到250天以保证可以计算SMA200
        const history = await this.service.getHistoryCandlesticks(symbol, 250);
        if (history.length < 210) {
          logger.warn(`数据不足 (需至少210天计算SMA200)，跳过: ${symbol}`);
          continue;
        }
        logger.info(`获取历史数据成功，数据量: ${history.length}`);

        logger.info(`计算指标: ${symbol}`);
        // TR & ATR
        const trValues: number[] = [];
        for (let i = 1; i < history.length; i++) {
          const tr = calculateTR(history[i], history[i - 1].close);
          trValues.push(tr);
        }
        // Take latest 14 for ATR (standard)
        const recentTrs = trValues.slice(-14);
        const atr = calculateATR(recentTrs);

        const stockPrices = Array.from(history, candle => candle.close);
        const sma200 = calculateSMA(stockPrices, 200);
        const sma50 = calculateSMA(stockPrices, 50);
        const ema21 = calculateEMA(stockPrices, 21);
        const ema50 = calculateEMA(stockPrices, 50);
        const rsi14 = calculateRSI(stockPrices, 14);
        const volatility = calculateVolatility(stockPrices, 60);
        const volatility200 = calculateVolatility(stockPrices, 200);

        const highs = history.map(c => c.high);
        const lows = history.map(c => c.low);
        const donchian55 = calculateDonchianChannel(highs, lows, 55);
        const bb20_2_5 = calculateBollingerBands(stockPrices, 20, 2.0);
        const donchian20 = calculateDonchianChannel(highs, lows, 20);
        const donchian10 = calculateDonchianChannel(highs, lows, 10);
        
        const strategyMode = (volatility < 0.50 && volatility200 < 0.50)
          ? '【趋势回调波段】(白马股)'
          : `【高波动${getHighVolSubtype(symbol) === 'oscillatory' ? '震荡回撤' : '趋势突破'}】`;
        logger.info(`[${symbol}] 历史年化波动率: 60d=${(volatility*100).toFixed(2)}%, 200d=${(volatility200*100).toFixed(2)}% -> 智能分配策略: ${strategyMode}`);
        logger.info(`ATR: ${atr.toFixed(2)}, SMA200: ${sma200.toFixed(2)}, SMA50: ${sma50.toFixed(2)}, RSI(14): ${rsi14.toFixed(2)}`);

        const currentPrice = await this.service.getCurrentPrice(symbol);
        logger.info(`当前价格: ${currentPrice}`);

        const volumes = history.map((c) => (c as any).volume || 0);
        const vma5 = calculateSMA(volumes, 5);
        const vma10 = calculateSMA(volumes, 10);
        const currentVolume = (history[history.length - 1] as any).volume || 0;

        if (isVcpStock(symbol)) {
          if (!this.vcpPositions.has(symbol)) {
            this.vcpPositions.set(symbol, new VcpPosition(symbol));
          }

          const position = this.vcpPositions.get(symbol)!;
          const benchmarkHistory = await this.service.getHistoryCandlesticks('SPY.US', history.length);
          const benchmarkPrices = Array.from(benchmarkHistory, candle => candle.close);
          const alignedLength = Math.min(stockPrices.length, benchmarkPrices.length);
          const alignedStockPrices = stockPrices.slice(-alignedLength);
          const alignedBenchmarkPrices = benchmarkPrices.slice(-alignedLength);
          const mansfieldPeriod = alignedLength > 1 ? Math.min(200, alignedLength - 1) : 1;
          const mansfieldRs = calculateMansfieldRS(alignedStockPrices, alignedBenchmarkPrices, mansfieldPeriod);
          const intradayCandles = await this.service.getIntradayCandlesticks(symbol, Period.Min_15, 26);
          const openingRangeHigh = calculateORHigh(intradayCandles as OHLC[]);

          // Update highest price for trailing stop
          if (position.units > 0) {
            position.updateHighestPrice(currentPrice);
          }

          // Calculate indicators using closed history (avoid lookahead bias)
          const closedHistory = history.slice(0, -1);
          const closedStockPrices = closedHistory.map(c => c.close);
          const closedVolumes = closedHistory.map(c => (c as any).volume || 0);
          const ema50Closed = calculateEMA(closedStockPrices, 50);
          const ema200Closed = calculateEMA(closedStockPrices, 200);
          const vma20Closed = calculateSMA(closedVolumes, 20);
          const vma5Closed = calculateSMA(closedVolumes.slice(-5), 5);

          // Calculate EMA21 slope
          const ema21Yesterday = closedStockPrices.length >= 22
            ? calculateEMA(closedStockPrices.slice(0, -1), 21)
            : ema21;
          const ema21Slope = ema21Yesterday > 0 ? (ema21 - ema21Yesterday) / ema21Yesterday : 0;

          // Calculate EMA50 slope
          const ema50Yesterday = closedStockPrices.length >= 51
            ? calculateEMA(closedStockPrices.slice(0, -1), 50)
            : ema50Closed;
          const ema50Slope = ema50Yesterday > 0 ? (ema50Closed - ema50Yesterday) / ema50Yesterday : 0;

          // Yesterday's volume
          const yesterdayVolume = closedVolumes.length > 0 ? closedVolumes[closedVolumes.length - 1] : 0;

          // VWAP approximation (use current price for live mode)
          const vwap = currentPrice;

          logger.info(`生成 VCP 信号: ${symbol}`);
          logger.info(`VCP指标: EMA21=${ema21.toFixed(2)}, EMA50=${ema50Closed.toFixed(2)}, EMA200=${ema200Closed.toFixed(2)}, ATR=${atr.toFixed(2)}, RS=${mansfieldRs.toFixed(4)}, Vol=${currentVolume}, VMA20=${vma20Closed.toFixed(0)}, VMA5=${vma5Closed.toFixed(0)}, YesterdayVol=${yesterdayVolume.toFixed(0)}, ORH=${openingRangeHigh.toFixed(2)}, EMA21Slope=${ema21Slope.toFixed(6)}, EMA50Slope=${ema50Slope.toFixed(6)}, HighestPrice=${position.highestPriceSinceEntry.toFixed(2)}`);

          const signal = generateVcpSignal({
            position,
            price: currentPrice,
            open: currentPrice,
            close: currentPrice,
            high: currentPrice,
            low: currentPrice,
            ema21,
            ema50: ema50Closed,
            ema200: ema200Closed,
            atr,
            volume: currentVolume,
            vma20: vma20Closed,
            vma5: vma5Closed,
            yesterdayVolume,
            orh: openingRangeHigh,
            ema21Slope,
            ema50Slope,
            vwap,
            highestPriceSinceEntry: position.highestPriceSinceEntry,
            isLive: true,
            currentTime: new Date(),
          });

          logger.info(`VCP信号结果: ${signal.action} (理由: ${signal.reason})`);

          if (signal.action === 'buy' || signal.action === 'sell') {
            const balanceInfo = await this.service.getAccountBalance();
            const isDryRun = process.env.DRY_RUN !== 'false';

            if (signal.action === 'buy') {
              const unitSize = calculateUnitSize(balanceInfo.totalCash, atr, volatility, symbol);
              const sharesToBuy = signal.suggestedUnits ? unitSize * signal.suggestedUnits : unitSize;

              if (sharesToBuy > 0) {
                if (isDryRun) {
                  logger.info(`【模拟测试】VCP买入订单已生成 (拦截真实交易), 数量: ${sharesToBuy}`);
                } else {
                  const resp = await this.service.submitOrder(symbol, 'buy', sharesToBuy);
                  logger.info(`VCP买入订单已提交, 数量: ${sharesToBuy}, 返回: ${JSON.stringify(resp)}`);
                }

                position.addUnit(currentPrice, sharesToBuy, currentPrice - 2 * atr, mansfieldRs, openingRangeHigh, signal.ema21 ?? ema21);
              }
            } else {
              const proportion = signal.sellProportion ?? 1.0;
              const sharesToSell = Math.floor(position.totalShares * proportion);

              if (sharesToSell > 0) {
                if (isDryRun) {
                  logger.info(`【模拟测试】VCP卖出订单已生成 (拦截真实交易), 数量: ${sharesToSell} (比例: ${proportion})`);
                } else {
                  const resp = await this.service.submitOrder(symbol, 'sell', sharesToSell);
                  logger.info(`VCP卖出订单已提交, 数量: ${sharesToSell}, 返回: ${JSON.stringify(resp)}`);
                }

                if (proportion >= 1.0) {
                  position.clear();
                } else {
                  position.adjustForPartialSell(proportion);
                }
              }
            }
          }

          continue;
        }

        if (!this.positions.has(symbol)) {
          this.positions.set(symbol, new TurtlePosition(symbol));
        }
        const position = this.positions.get(symbol)!;

        // === 预测入场点位 (Predict Target Entry Price) ===
        let targetEntryMsg = '';

        if (position.units > 0) {
          // 已有持仓，预测出场和加仓点
          const stopLossPrice = position.stopLossPrice;
          if (volatility < 0.50 && volatility200 < 0.50) {
            targetEntryMsg = `当前持仓 ${position.totalShares} 股。预测反弹至 RSI(14)>80 或 移动止盈 (5%利润后回撤2%)，跌破 $${stopLossPrice.toFixed(2)} (2N) 止损。`;
          } else {
            const exit10DayPrice = donchian10.lower;
            const lastEntry = position.lastEntryPrice || 0;
            const pyramidPrice = lastEntry + 0.5 * atr;

            targetEntryMsg = `当前持仓 ${position.totalShares} 股。`;
            if (position.units < 4) {
              targetEntryMsg += `预测突破 $${pyramidPrice.toFixed(2)} (+0.5N) 加仓；`;
            } else {
              targetEntryMsg += `仓位已满(4 Units)；`;
            }
            targetEntryMsg += `预测跌破 $${exit10DayPrice.toFixed(2)} (10日低点) 或 $${stopLossPrice.toFixed(2)} (2N) 止损离场。`;
          }
        } else {
          // 空仓状态，预测入场点
          if (volatility < 0.50 && volatility200 < 0.50) {
            // 均线回调预测:
            if (currentPrice > sma200) {
               targetEntryMsg = `等待回踩 50日均线($${sma50.toFixed(2)}) 附近且动能降温 (当前价格: $${currentPrice.toFixed(2)}, RSI14: ${rsi14.toFixed(2)})`;
            } else {
               targetEntryMsg = `目前处于熊市结构 (Price < SMA200), 系统禁止建仓`;
            }
          } else {
            if (getHighVolSubtype(symbol) === 'oscillatory') {
              targetEntryMsg = `等待高波动震荡股回调后重新站回 EMA21($${ema21.toFixed(2)}) 再入场，避免直接追涨`;
            } else {
              const targetBreakoutPrice = donchian55.upper;
              if (currentPrice < targetBreakoutPrice) {
                targetEntryMsg = `预测突破 $${targetBreakoutPrice.toFixed(2)} 时触发高波动趋势突破入场`;
              } else {
                targetEntryMsg = `正在突破或已持有`;
              }
            }
          }
        }

        logger.info(`🎯 [盘前预测] ${targetEntryMsg}`);

        logger.info(`生成信号: ${symbol}`);
        const signal = generateSignal(position, currentPrice, sma200, sma50, ema21, rsi14, donchian55, bb20_2_5, donchian20, donchian10, atr, volatility, volatility200, isMarketPanic);
        
        logger.info(`信号结果: ${signal.action} (理由: ${signal.reason})`);

        if (signal.action === 'buy' || signal.action === 'sell') {
          const balanceInfo = await this.service.getAccountBalance();
          
          let unitsToTrade = 0;
          const isDryRun = process.env.DRY_RUN !== 'false'; // 默认开启模拟测试，不发送真实订单

          if (signal.action === 'buy') {
             const unitSize = calculateUnitSize(balanceInfo.totalCash, atr, volatility, symbol);
             unitsToTrade = signal.suggestedUnits ? unitSize * signal.suggestedUnits : unitSize;
             if (unitsToTrade > 0) {
                if (isDryRun) {
                  logger.info(`【模拟测试】买入订单已生成 (拦截真实交易), 数量: ${unitsToTrade}`);
                position.addUnit(currentPrice, atr, unitsToTrade, signal.reason);
              } else {
                // Submit order
                const resp = await this.service.submitOrder(symbol, 'buy', unitsToTrade);
                logger.info(`买入订单已提交, 数量: ${unitsToTrade}, 返回: ${JSON.stringify(resp)}`);
                position.addUnit(currentPrice, atr, unitsToTrade, signal.reason);
                }
             }
      } else if (signal.action === 'sell') {
        const proportion = signal.sellProportion ?? 1.0;
        const sharesToSell = Math.floor(position.totalShares * proportion);

        if (sharesToSell > 0) {
          if (isDryRun) {
            logger.info(`【模拟测试】卖出订单已生成 (拦截真实交易), 数量: ${sharesToSell} (比例: ${proportion})`);
          } else {
            const resp = await this.service.submitOrder(symbol, 'sell', sharesToSell);
            logger.info(`卖出订单已提交, 数量: ${sharesToSell}, 返回: ${JSON.stringify(resp)}`);
          }

          if (proportion >= 1.0) {
            position.clear();
          } else {
            position.adjustForPartialSell(sharesToSell);
          }
        }
      }
        }
      } catch (err) {
        logger.error(`处理 ${symbol} 时发生错误: `, err);
      }
    }
  }
}
