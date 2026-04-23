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

