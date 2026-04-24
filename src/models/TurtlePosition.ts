export class TurtlePosition {
  public symbol: string;
  public units: number = 0; // 加仓次数 (最高通常为4)
  public totalShares: number = 0; // 真实持仓股数
  public entryPrices: number[] = [];
  public N: number = 0; // ATR at the time of entry
  public stopLossPrice: number = 0;
  public highestPriceSinceEntry: number | null = null;
  public hasCutHalf: boolean = false; // 是否已经因为触发 2N 减仓过一半

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  addUnit(price: number, atr: number, shares: number) {
    if (this.units === 0) {
      this.N = atr;
    }
    this.units += 1;
    this.totalShares += shares;
    this.entryPrices.push(price);
    // 止损线 (最后买入价 - 2N)
    this.stopLossPrice = price - 2 * this.N;
  }

  /**
   * 部分卖出后调整仓位状态
   * 减仓一半后，止损线收紧到入场均价 - 2N（保证剩余仓位不再亏损）
   * 标记 hasCutHalf=true 防止重复减仓
   */
  adjustForPartialSell(soldShares: number) {
    this.totalShares -= soldShares;
    if (this.totalShares <= 0) {
      this.clear();
      return;
    }
    // 收紧止损线到入场均价 - 2N，保证剩余仓位安全
    const avgCost = this.entryPrices.reduce((a, b) => a + b, 0) / this.entryPrices.length;
    this.stopLossPrice = avgCost - 2 * this.N;
    this.hasCutHalf = true;
    // 减仓后保留最高价跟踪，用于移动止盈
  }

  clear() {
    this.units = 0;
    this.totalShares = 0;
    this.entryPrices = [];
    this.N = 0;
    this.stopLossPrice = 0;
    this.highestPriceSinceEntry = null;
    this.hasCutHalf = false;
  }

  get lastEntryPrice(): number | null {
    if (this.entryPrices.length === 0) return null;
    return this.entryPrices[this.entryPrices.length - 1];
  }
}

