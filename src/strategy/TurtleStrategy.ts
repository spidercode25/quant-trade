import { TurtlePosition } from '../models/TurtlePosition';
import { DonchianChannel, BollingerBands } from './TurtleIndicators';

export interface TradeSignal {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
  suggestedUnits?: number;
  sellProportion?: number; // 卖出比例 (0~1)
}

type FullGenerateSignalArgs = [
  TurtlePosition,
  number,
  number,
  number,
  number,
  number,
  DonchianChannel,
  BollingerBands,
  DonchianChannel,
  DonchianChannel,
  number,
  number,
  number,
  boolean?
];

type LegacyGenerateSignalArgs = [
  TurtlePosition,
  number,
  number,
  number,
  number,
  number,
  DonchianChannel,
  DonchianChannel,
  number,
  number,
  boolean?
];

export function generateSignal(...args: FullGenerateSignalArgs): TradeSignal;
export function generateSignal(...args: LegacyGenerateSignalArgs): TradeSignal;
export function generateSignal(
  ...args: FullGenerateSignalArgs | LegacyGenerateSignalArgs
): TradeSignal {
  const [position, currentPrice, sma200, sma50, ema21, rsi14] = args;
  let donchian55: DonchianChannel;
  let bb20_2_5: BollingerBands;
  let donchian20: DonchianChannel;
  let donchian10: DonchianChannel;
  let atr: number;
  let volatility: number;
  let volatility200: number;
  let isMarketPanic = false;

  if (args.length === 11) {
    const legacyArgs = args as LegacyGenerateSignalArgs;
    [, , , , , , donchian20, donchian10, atr, volatility, isMarketPanic = false] = legacyArgs;
    donchian55 = donchian20;
    bb20_2_5 = { upper: donchian20.upper, middle: sma50, lower: donchian10.lower };
    volatility200 = volatility;
  } else {
    const fullArgs = args as FullGenerateSignalArgs;
    [, , , , , , donchian55, bb20_2_5, donchian20, donchian10, atr, volatility, volatility200, isMarketPanic = false] = fullArgs;
  }
  
  
  if (volatility < 0.50 && volatility200 < 0.50) {
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
      
      // 过度拉升过滤器：如果 SMA50 比 SMA200 高出 15% 以上，说明在炒作高点，不接飞刀
      const isOverExtended = (sma50 / sma200 - 1) > 0.15;
      
      if (currentPrice > sma200 && isNearSma50 && rsi14 < 50 && !isOverExtended) {
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
       if (position.entryReason !== 'rubber_band_dip' && currentPrice < sma200 * 0.97) {
        return { action: 'sell', reason: 'hard_stop_sma200', sellProportion: 1.0 };
      }

          if (position.entryReason === 'rubber_band_dip' && currentPrice > bb20_2_5.middle) {
            return { action: 'sell', reason: 'mean_reversion_target', sellProportion: 1.0 };
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
      if (currentPrice < bb20_2_5.lower || rsi14 < 40) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }
        return { action: 'buy', reason: 'rubber_band_dip', suggestedUnits: 1 };
      }

      if (currentPrice > donchian55.upper) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }
        return { action: 'buy', reason: 'breakout_55', suggestedUnits: 1 };
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
