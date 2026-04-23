import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { LongbridgeService } from './exchange/LongbridgeService';
import { TurtlePosition } from './models/TurtlePosition';
import { calculateTR, calculateATR, calculateSMA, calculateEMA, calculateRSI, calculateDonchianChannel, calculateVolatility, OHLC } from './strategy/TurtleIndicators';
import { generateSignal, calculateUnitSize } from './strategy/TurtleStrategy';

dotenv.config();

async function runBacktest() {
  logger.info('=== 开始海龟交易系统一年期回测 ===');
  const service = new LongbridgeService();
  await service.init();

  const symbols = (process.env.STOCK_POOL || 'SPY.US,AAPL.US,TSLA.US').split(',').map(s => s.trim());
  const initialCapital = 10000;

  for (const symbol of symbols) {
    logger.info(`\n--- 标的: ${symbol} ---`);
    let cash = initialCapital;
    let position = new TurtlePosition(symbol);
    const trades: any[] = [];
    
    // 拉取过去 500 天的日K线数据 (确保够前置计算 SMA200)
    logger.info(`正在拉取历史数据...`);
    const history = await service.getHistoryCandlesticks(symbol, 500);
    const vxxHistoryRaw = await service.getHistoryCandlesticks('VXX.US', 500);
    
    // Map VXX history by timestamp for fast lookup
    const vxxMap = new Map<number, OHLC>();
    vxxHistoryRaw.forEach(v => {
      vxxMap.set(Number(v.time), v);
    });
    
    if (history.length < 210) {
      logger.warn(`${symbol} 历史数据不足`);
      continue;
    }

    const startDate = new Date(Number(history[0].time)).toISOString().split('T')[0];
    const endDate = new Date(Number(history[history.length - 1].time)).toISOString().split('T')[0];
    logger.info(`获取到 ${history.length} 天的历史数据，从 ${startDate} 到 ${endDate}`);

    // 回测主循环，从第210天开始（留出时间计算SMA200）
    for (let i = 210; i < history.length; i++) {
      const today = history[i];
      const currentPrice = today.close; // 为简化，回测按收盘价判定和成交

      // 准备历史数据用于计算指标
      const windowData = history.slice(0, i); // 取今天之前的所有数据
      
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

      // 计算回测当天的 VXX 状态
      let isMarketPanic = false;
      const todayTime = Number(today.time);
      // 获取今天之前的 VXX 历史数据
      const vxxWindowData = vxxHistoryRaw.filter(v => Number(v.time) < todayTime);
      
      if (vxxWindowData.length >= 10) {
        // 如果能拿到当天的 VXX 数据，最好；回测中假定能拿到收盘价作为参考
        const currentVxxOHLC = vxxMap.get(todayTime);
        const vxxCurrentPrice = currentVxxOHLC ? currentVxxOHLC.close : vxxWindowData[vxxWindowData.length - 1].close;
        
        const vxxCloses = vxxWindowData.map(v => v.close);
        const vxxSma10 = calculateSMA(vxxCloses, 10);
        const yesterdayVxxClose = vxxCloses[vxxCloses.length - 1];
        const vxxDailyChange = yesterdayVxxClose > 0 ? (vxxCurrentPrice / yesterdayVxxClose) - 1 : 0;
        
        isMarketPanic = (vxxCurrentPrice > vxxSma10) || (vxxDailyChange > 0.05);
      }

      const signal = generateSignal(position, currentPrice, sma200, sma50, ema21, rsi14, donchian20, donchian10, atr, volatility, isMarketPanic);

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
        // 卖出持仓
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
          
          if (proportion === 1.0) {
             position.clear();
          } else {
             position.totalShares -= unitsToSell;
             // 如果还有其他需要缩减的状态可以放这里，比如 units = Math.ceil(units/2)
             position.units = Math.ceil(position.units / 2);
          }
        }
      }
    }

    // 回测结束，计算资产净值
    const currentPrice = history[history.length - 1].close;
    let finalHoldingsValue = 0;
    if (position.units > 0) {
      finalHoldingsValue = position.totalShares * currentPrice;
    }
    
    const finalNetAsset = cash + finalHoldingsValue;
    const pnl = finalNetAsset - initialCapital;
    const pnlPercent = (pnl / initialCapital) * 100;

    logger.info(`[回测结果 - ${symbol}]`);
    logger.info(`初始资金: $${initialCapital.toFixed(2)}`);
    logger.info(`最终现金: $${cash.toFixed(2)}`);
    logger.info(`持仓市值: $${finalHoldingsValue.toFixed(2)}`);
    logger.info(`最终净值: $${finalNetAsset.toFixed(2)}`);
    logger.info(`总盈亏:   $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    logger.info(`交易次数: ${trades.length} 次`);
    
    // 打印最近的几次交易
    if (trades.length > 0) {
      logger.info('所有交易记录 (节选最近10次):');
      trades.slice(-10).forEach(t => {
        logger.info(`  ${t.date} | ${t.action.padEnd(4)} | 价格: $${t.price.toFixed(2).padStart(6)} | 数量: ${t.units} | 理由: ${t.reason.padEnd(12)} | 剩余现金: $${t.cashLeft.toFixed(2)}`);
      });
    } else {
      logger.info('期间无交易产生。');
    }
  }

  process.exit(0);
}

runBacktest().catch(err => {
  logger.error('回测失败:', err);
  process.exit(1);
});