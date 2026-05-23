export interface TradeSignal {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
  suggestedUnits?: number;
  sellProportion?: number; // 卖出比例 (0~1)
  ema21?: number; // EMA21 value at entry (for TP activation threshold)
}
