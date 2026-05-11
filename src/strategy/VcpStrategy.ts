import { VcpPosition } from '../models/VcpPosition';
import type { TradeSignal } from './types';

export function generateVcpSignal(
  position: VcpPosition,
  currentPrice: number,
  ema21: number,
  ema50: number,
  atr: number,
  rs: number,
  bandwidth: number,
  orHigh: number,
  volumeRatio: number,
): TradeSignal {
  void atr;

  if (position.units > 0) {
    if (currentPrice < ema21) {
      return { action: 'sell', reason: 'ema21_break_exit', sellProportion: 1.0 };
    }

    const isNearEma50 = currentPrice >= ema50 * 0.98 && currentPrice <= ema50 * 1.02;
    if (isNearEma50 && bandwidth < 0.08) {
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
    currentPrice > ema21
    && currentPrice > orHigh
    && bandwidth < 0.10
    && volumeRatio > 2.0
    && rs > 1.0
  ) {
    return { action: 'buy', reason: 'vcp_breakout_entry', suggestedUnits: 1 };
  }

  return { action: 'hold', reason: 'waiting_for_setup' };
}
