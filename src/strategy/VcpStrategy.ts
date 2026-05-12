import { VcpPosition } from '../models/VcpPosition';
import type { TradeSignal } from './types';

export function generateVcpSignal(
  position: VcpPosition,
  currentPrice: number,
  ema21: number,
  sma50: number,
  sma150: number,
  sma200: number,
  donchian20Upper: number,
  atr: number,
  rs: number,
  bandwidth: number,
  orHigh: number,
  currentVolume: number,
  vma5: number,
  vma10: number,
): TradeSignal {
  void atr;

  if (position.units > 0) {
    if (position.stopLossPrice > 0 && currentPrice <= position.stopLossPrice) {
      return { action: 'sell', reason: 'stop_loss_hit', sellProportion: 1.0 };
    }

    if (currentPrice < ema21) {
      return { action: 'sell', reason: 'ema21_break_exit', sellProportion: 1.0 };
    }

    const isNearSma50 = currentPrice >= sma50 * 0.98 && currentPrice <= sma50 * 1.02;
    if (isNearSma50 && bandwidth < 0.08) {
      if (position.units < 4) {
        const lastEntryPrice = position.entryPrices.length > 0 ? position.entryPrices[position.entryPrices.length - 1] : 0;
        const priceDiffRatio = lastEntryPrice > 0 ? Math.abs(currentPrice - lastEntryPrice) / lastEntryPrice : 1;

        if (priceDiffRatio > 0.02) {
          return { action: 'buy', reason: 'vcp_addon_pullback', suggestedUnits: 1 };
        }
      }
    }

    return { action: 'hold', reason: 'trend_continuation' };
  }

  if (
    currentPrice >= donchian20Upper
    && sma50 > sma150
    && sma150 > sma200
    && bandwidth < 0.20 // Relaxed bandwidth for daily data backtest
    && currentVolume > vma5 // VOL-TDX 放量比较
    && currentVolume > vma10
    && rs > 0 // Mansfield RS > 0 means outperforming benchmark
  ) {
    return { action: 'buy', reason: 'vcp_breakout_entry', suggestedUnits: 1 };
  }

  return { action: 'hold', reason: 'waiting_for_setup' };
}
