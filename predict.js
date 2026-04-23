const { LongbridgeService } = require('./dist/exchange/LongbridgeService.js');
const { calculateSMA, calculateRSI, predictTargetPriceForRSI, calculateDonchianChannel, calculateVolatility } = require('./dist/strategy/TurtleIndicators.js');
require('dotenv').config();

async function run() {
  const service = new LongbridgeService();
  await service.init();
  
  const symbols = ['TSLA.US', 'HOOD.US', 'CRCL.US', 'DXYZ.US'];
  
  for (const symbol of symbols) {
    try {
      const history = await service.getHistoryCandlesticks(symbol, 250);
      if (history.length < 210) {
        console.log(`\n[${symbol}] 数据不足 (仅 ${history.length} 天)，需至少 210 天计算指标，无法预测`);
        continue;
      }
      
      const closes = history.map(c => c.close);
      const highs = history.map(c => c.high);
      const lows = history.map(c => c.low);
      
      const volatility = calculateVolatility(closes, 60);
      const sma200 = calculateSMA(closes, 200);
      const rsi2 = calculateRSI(closes, 2);
      const donchian20 = calculateDonchianChannel(highs, lows, 20);
      
      const currentPrice = await service.getCurrentPrice(symbol);
      const strategyMode = volatility < 0.50 ? '【均值回归】(白马股)' : '【海龟突破】(题材/妖股)';
      
      console.log(`\n==================================================`);
      console.log(`[${symbol}] 当前价格: $${currentPrice.toFixed(2)} | 年化波动率: ${(volatility * 100).toFixed(2)}% | 策略分配: ${strategyMode}`);
      
      if (volatility < 0.50) {
        const targetRSIPrice = predictTargetPriceForRSI(closes.slice(0, -1), 2, 14.99);
        if (targetRSIPrice !== null && targetRSIPrice < currentPrice && currentPrice > sma200) {
          console.log(`🎯 [盘前预测] 预测跌至 $${targetRSIPrice.toFixed(2)} 时触发均值回归入场 (RSI2 < 15)`);
        } else if (currentPrice <= sma200) {
          console.log(`🎯 [盘前预测] 目前处于熊市结构 (Price $${currentPrice.toFixed(2)} <= SMA200 $${sma200.toFixed(2)}), 系统禁止抄底`);
        } else {
          console.log(`🎯 [盘前预测] 无需深跌或已触发入场，当前 RSI(2): ${rsi2.toFixed(2)}`);
        }
      } else {
        const targetBreakoutPrice = donchian20.upper;
        if (currentPrice < targetBreakoutPrice) {
          console.log(`🎯 [盘前预测] 预测突破 $${targetBreakoutPrice.toFixed(2)} 时触发海龟入场 (动量追涨)`);
        } else {
          console.log(`🎯 [盘前预测] 正在突破或已持有 (当前价 $${currentPrice.toFixed(2)} >= 20日极高点 $${targetBreakoutPrice.toFixed(2)})`);
        }
      }
    } catch (err) {
      console.log(`\n[${symbol}] 分析出错: ${err.message}`);
    }
  }
  process.exit(0);
}

run().catch(console.error);