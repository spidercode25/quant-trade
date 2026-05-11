export interface TradeSignal {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
  suggestedUnits?: number;
  sellProportion?: number; // 卖出比例 (0~1)
}
