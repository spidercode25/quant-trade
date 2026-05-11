export class VcpPosition {
  public symbol: string;
  public totalShares: number = 0;
  public units: number = 0;
  public entryPrices: number[] = [];
  public stopLossPrice: number = 0;
  public vcpStage: number = 1;
  public orHighReference: number | null = null;
  public rsAtEntry: number | null = null;

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  addUnit(price: number, shares: number, stopLoss: number, rs?: number, orHigh?: number): void {
    this.units += 1;
    this.totalShares += shares;
    this.entryPrices.push(price);
    this.stopLossPrice = stopLoss;

    if (rs !== undefined) {
      this.rsAtEntry = rs;
    }

    if (orHigh !== undefined) {
      this.orHighReference = orHigh;
    }
  }

  clear(): void {
    this.totalShares = 0;
    this.units = 0;
    this.entryPrices = [];
    this.stopLossPrice = 0;
    this.vcpStage = 1;
    this.orHighReference = null;
    this.rsAtEntry = null;
  }

  adjustForPartialSell(proportion: number): void {
    if (proportion >= 1 || this.totalShares <= 0) {
      this.clear();
      return;
    }

    const remainingShares = this.totalShares * (1 - proportion);
    this.totalShares = remainingShares;

    if (this.totalShares <= 0) {
      this.clear();
    }
  }
}
