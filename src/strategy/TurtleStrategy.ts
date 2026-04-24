import { TurtlePosition } from '../models/TurtlePosition';
import { DonchianChannel } from './TurtleIndicators';

export interface TradeSignal {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
  suggestedUnits?: number;
  sellProportion?: number; // 卖出比例 (0~1)
}

export function generateSignal(
  position: TurtlePosition,
  currentPrice: number,
  sma200: number,
  sma50: number,
  ema21: number,
  rsi14: number,
  donchian20: DonchianChannel,
  donchian10: DonchianChannel,
  atr: number,
  volatility: number,
  isMarketPanic: boolean = false
): TradeSignal {
  
  if (volatility < 0.50) {
    // === 分支A：趋势回调引擎 (低波动白马股 - SMA50 强支撑) ===
    if (position.units > 0) {
      // 1. 强止损触发 (跌破牛熊分界线 SMA200) -> 清仓全部
      if (currentPrice < sma200) {
        return { action: 'sell', reason: 'hard_stop_sma200', sellProportion: 1.0 };
      }

      // 2. 减仓触发 (海龟 2N 止损)
      // 首次跌破止损线 -> 减仓一半，止损线收紧到入场均价 - 2N
      // 再次跌破收紧后的止损线 -> 清仓剩余
      if (currentPrice < position.stopLossPrice) {
        if (!position.hasCutHalf) {
          return { action: 'sell', reason: 'cut_half_2n', sellProportion: 0.5 };
        } else {
          return { action: 'sell', reason: 'exit_remaining_2n', sellProportion: 1.0 };
        }
      }
      
      // 3. 止盈触发 (均值回归，盈利超过 5% 后，回撤 2% 平仓)
      const avgCost = position.entryPrices.reduce((a, b) => a + b, 0) / position.entryPrices.length;
      if (currentPrice > avgCost * 1.05) {
         if (!position.highestPriceSinceEntry || currentPrice > position.highestPriceSinceEntry) {
             position.highestPriceSinceEntry = currentPrice;
         }
         // 回撤 2% 止盈
         if (currentPrice < position.highestPriceSinceEntry * 0.98) {
             return { action: 'sell', reason: 'trailing_stop_profit', sellProportion: 1.0 };
         }
      } 
      
      // 4. 超买止盈 (RSI(14) > 80 表明短期反弹动能极度衰竭)
      if (rsi14 > 80) {
        return { action: 'sell', reason: 'take_profit_overbought', sellProportion: 1.0 };
      }
      
      // 趋势波段策略通常单次建仓，不加仓
      return { action: 'hold', reason: 'holding' };
    } else {
      // 3. 入场触发 (均线回调买入)
      // 只有在长期趋势向上 (SMA200以上)，价格回踩至 50日均线附近 (±2%)，且动能偏弱未超买 (RSI14 < 50) 时买入
      const isNearSma50 = currentPrice >= sma50 * 0.98 && currentPrice <= sma50 * 1.02;
      
      if (currentPrice > sma200 && isNearSma50 && rsi14 < 50) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }
        return { action: 'buy', reason: 'buy_pullback', suggestedUnits: 1 };
      }
      
      return { action: 'hold', reason: 'waiting' };
    }
  } else {
    // === 分支B：海龟突破引擎 (高波动题材/妖股) ===
    if (position.units > 0) {
      // 1. 强止损触发 (跌破牛熊分界线 SMA200) -> 清仓全部
      if (currentPrice < sma200) {
        return { action: 'sell', reason: 'hard_stop_sma200', sellProportion: 1.0 };
      }

      // 2. 减仓触发 (海龟 2N 止损)
      // 首次跌破止损线 -> 减仓一半，止损线收紧到入场均价 - 2N
      // 再次跌破收紧后的止损线 -> 清仓剩余
      if (currentPrice < position.stopLossPrice) {
        if (!position.hasCutHalf) {
          return { action: 'sell', reason: 'cut_half_2n', sellProportion: 0.5 };
        } else {
          return { action: 'sell', reason: 'exit_remaining_2n', sellProportion: 1.0 };
        }
      }
      
      // 3. 离场触发 (跌破10日极低点，或盈利超过 20% 后回撤 10% 止盈 - 适配高波动妖股)
      const avgCost = position.entryPrices.reduce((a, b) => a + b, 0) / position.entryPrices.length;
      if (currentPrice > avgCost * 1.20) {
          if (!position.highestPriceSinceEntry || currentPrice > position.highestPriceSinceEntry) {
              position.highestPriceSinceEntry = currentPrice;
          }
          if (currentPrice < position.highestPriceSinceEntry * 0.90) {
              return { action: 'sell', reason: 'trailing_stop_profit', sellProportion: 1.0 };
          }
      }
      
      if (currentPrice < donchian10.lower) {
        return { action: 'sell', reason: 'exit_10day_low', sellProportion: 1.0 };
      }
      
      // 3. 加仓触发 (价格上涨 0.5ATR)
      const lastPrice = position.lastEntryPrice;
      if (lastPrice !== null && position.units < 4 && currentPrice > lastPrice + 0.5 * atr) {
        return { action: 'buy', reason: 'pyramid', suggestedUnits: 1 };
      }
      
      return { action: 'hold', reason: 'holding' };
    } else {
      // Look for entry (Turtle Breakout)
      if (currentPrice > donchian20.upper) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }
        return { action: 'buy', reason: 'breakout', suggestedUnits: 1 };
      }
      return { action: 'hold', reason: 'waiting' };
    }
  }
}

export function calculateUnitSize(
  totalAccountValue: number, 
  atr: number, 
  volatility: number
): number {
  if (atr <= 0) return 0;
  
  let riskPercent = 0.02; // 默认 2% 风险敞口
  
  // 自适应风险放大器：针对波动率超过 50% 的海龟突破策略
  // 肥尾对冲，放大单次搏趋势的绝对股数
  if (volatility >= 0.80) {
    riskPercent = 0.04; // 极其疯狂的股票 (如 OKLO)，放大至 4%
  } else if (volatility >= 0.50) {
    riskPercent = 0.03; // 高波动股票 (如 TSLA)，放大至 3%
  }

  // 1 Unit = (TotalAccountValue * RiskPercent) / ATR
  const riskAmount = totalAccountValue * riskPercent;
  return Math.floor(riskAmount / atr);
}
