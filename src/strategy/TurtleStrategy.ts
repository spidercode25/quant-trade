import { getHighVolSubtype } from '../config/stockConfig';
import { TurtlePosition } from '../models/TurtlePosition';
import { DonchianChannel, BollingerBands } from './TurtleIndicators';
import type { TradeSignal } from './types';

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
  const recentHigh = donchian20.upper;
  const recentLow = donchian10.lower;

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
    const highVolSubtype = getHighVolSubtype(position.symbol);

    if (highVolSubtype === 'oscillatory') {
      if (position.units > 0) {
        const avgCost = position.entryPrices.reduce((a, b) => a + b, 0) / position.entryPrices.length;
        const currentProfit = currentPrice / avgCost - 1;

        if (currentPrice < sma200 * 0.99) {
          if (currentProfit < 0) {
            return { action: 'sell', reason: 'osc_failed_rebound_exit', sellProportion: 1.0 };
          }
          return { action: 'sell', reason: 'osc_trend_reversal_exit', sellProportion: 1.0 };
        }

        const baseStopLoss = avgCost - 1.5 * position.N;
        const lastEntry = position.lastEntryPrice || avgCost;
        const reboundStopLoss = lastEntry - 1.0 * atr;
        const effectiveStopLoss = Math.max(baseStopLoss, reboundStopLoss);

        if (currentPrice < effectiveStopLoss) {
          return { action: 'sell', reason: 'osc_atr_stop_exit', sellProportion: 1.0 };
        }

        if (currentPrice > bb20_2_5.middle && rsi14 >= 55) {
          return { action: 'sell', reason: 'osc_rebound_take_profit', sellProportion: 1.0 };
        }

        if (currentProfit > 0.10) {
          if (!position.highestPriceSinceEntry || currentPrice > position.highestPriceSinceEntry) {
            position.highestPriceSinceEntry = currentPrice;
          }

          const trailingStopPrice = position.highestPriceSinceEntry * 0.96;
          if (currentPrice < trailingStopPrice) {
            return { action: 'sell', reason: 'osc_trailing_profit_stop', sellProportion: 1.0 };
          }
        }

        return { action: 'hold', reason: 'holding_oscillatory_position' };
      }

      const isUptrend = currentPrice > sma200 && sma50 > sma200 * 0.92;
      if (!isUptrend) {
        return { action: 'hold', reason: 'waiting_oscillatory_uptrend' };
      }

      const pullbackFromHigh = recentHigh > 0 ? (recentHigh - currentPrice) / recentHigh : 0;
      const isPullbackRange = pullbackFromHigh >= 0.06 && pullbackFromHigh <= 0.22;
      const isNearLow = currentPrice <= recentLow * 1.03;
      const isReclaimingEma21 = currentPrice > ema21;
      const isRSIRecovering = rsi14 >= 42 && rsi14 <= 58;

      if (isPullbackRange && isNearLow && isReclaimingEma21 && isRSIRecovering) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }

        return { action: 'buy', reason: 'osc_pullback_reclaim_entry', suggestedUnits: 1 };
      }

      return { action: 'hold', reason: 'waiting_oscillatory_pullback' };
    }

    // === 分支B：高波动趋势突破引擎 ===
    // 核心逻辑：SMA200趋势过滤 + 回撤企稳/突破入场 + 盈利加仓 + ATR/趋势退出
    if (position.units > 0) {
      const avgCost = position.entryPrices.reduce((a, b) => a + b, 0) / position.entryPrices.length;
      const currentProfit = currentPrice / avgCost - 1;

      // 1. 趋势止损：高波动趋势股跌破长期趋势后快速退出
      if (currentPrice < sma200 * 0.97) {
        if (currentProfit < 0) {
          return { action: 'sell', reason: 'trend_stop_loss', sellProportion: 1.0 };
        }
        return { action: 'sell', reason: 'trend_reversal_exit', sellProportion: 1.0 };
      }

      // 2. ATR 移动止损：保护盈利同时避免妖股剧烈回撤
      const baseStopLoss = avgCost - 2 * position.N;
      const lastEntry = position.lastEntryPrice || avgCost;
      const trailingStopLoss = lastEntry - 1.5 * atr;
      const effectiveStopLoss = Math.max(baseStopLoss, trailingStopLoss);

      if (currentPrice < effectiveStopLoss) {
        if (!position.hasCutHalf && position.units >= 2) {
          return { action: 'sell', reason: 'atr_trailing_stop_half', sellProportion: 0.5 };
        }
        return { action: 'sell', reason: 'atr_trailing_stop_full', sellProportion: 1.0 };
      }

      // 3. 盈利加仓：只给已经盈利且继续突破的仓位加仓
      if (position.units < 4) {
        const lastEntryPrice = position.lastEntryPrice || avgCost;
        const breakoutThreshold = lastEntryPrice + 0.5 * atr;
        const breakoutReference = recentHigh * 0.995;
        const isBreakout = currentPrice > breakoutReference;

        if (currentProfit > 0.05 && currentPrice > breakoutThreshold && isBreakout) {
          return { action: 'buy', reason: 'profit_pyramid', suggestedUnits: 1 };
        }
      }

      // 4. 趋势止盈：浮盈充分后用宽 trailing stop 保护主升浪
      if (currentProfit > 0.15) {
        if (!position.highestPriceSinceEntry || currentPrice > position.highestPriceSinceEntry) {
          position.highestPriceSinceEntry = currentPrice;
        }

        const trailingStopPrice = position.highestPriceSinceEntry * 0.93;
        if (currentPrice < trailingStopPrice) {
          return { action: 'sell', reason: 'trailing_profit_stop', sellProportion: 1.0 };
        }
      }

      return { action: 'hold', reason: 'holding_position' };
    } else {
      const isUptrend = currentPrice > sma200 && sma50 > sma200 * 0.95;
      if (!isUptrend) {
        return { action: 'hold', reason: 'waiting_uptrend' };
      }

      // 1. 回撤企稳后二次启动：不是抄底，而是等回调结束后恢复强势
      const pullbackFromHigh = recentHigh > 0 ? (recentHigh - currentPrice) / recentHigh : 0;
      const isPullbackRange = pullbackFromHigh >= 0.05 && pullbackFromHigh <= 0.20;
      const isNearLow = currentPrice <= recentLow * 1.02;
      const isRSIStabilizing = rsi14 > 30 && rsi14 < 50;
      const isStabilized = isNearLow && isRSIStabilizing;
      const isBreakoutConfirm = currentPrice > ema21 || currentPrice > (recentLow + (recentHigh - recentLow) * 0.5);

      if (isPullbackRange && isStabilized && isBreakoutConfirm) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }

        if (pullbackFromHigh > 0.10) {
          return { action: 'buy', reason: 'deep_pullback_entry', suggestedUnits: 1 };
        }
        return { action: 'buy', reason: 'shallow_pullback_entry', suggestedUnits: 1 };
      }

      // 2. 主入口：趋势突破入场
      const breakoutEntryThreshold = recentHigh * 0.995;
      if (currentPrice > breakoutEntryThreshold && rsi14 > 50 && rsi14 < 70) {
        if (isMarketPanic) {
          return { action: 'hold', reason: 'market_panic_filter' };
        }
        return { action: 'buy', reason: 'momentum_breakout_entry', suggestedUnits: 1 };
      }

      return { action: 'hold', reason: 'waiting_pullback' };
    }
  }
}

export function calculateUnitSize(
  totalAccountValue: number, 
  atr: number, 
  volatility: number,
  symbol?: string
): number {
  if (atr <= 0) return 0;
  
  let riskPercent = 0.02; // 默认 2% 风险敞口
  
  // 自适应风险放大器：针对波动率超过 50% 的海龟突破策略
  // 肥尾对冲，放大单次搏趋势的绝对股数
  if (symbol && volatility >= 0.50 && getHighVolSubtype(symbol) === 'oscillatory') {
    riskPercent = 0.02;
  } else if (volatility >= 0.80) {
    riskPercent = 0.04; // 极其疯狂的股票 (如 OKLO)，放大至 4%
  } else if (volatility >= 0.50) {
    riskPercent = 0.03; // 高波动股票 (如 TSLA)，放大至 3%
  }

  // 1 Unit = (TotalAccountValue * RiskPercent) / ATR
  const riskAmount = totalAccountValue * riskPercent;
  return Math.floor(riskAmount / atr);
}
