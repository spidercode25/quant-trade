export class VcpPosition {
  public symbol: string;
  public totalShares: number = 0;
  public units: number = 0;
  public entryPrices: number[] = [];
  public stopLossPrice: number = 0;
  public vcpStage: number = 1;
  public orHighReference: number | null = null;
  public rsAtEntry: number | null = null;
  public highestPriceSinceEntry: number = 0;

  // New fields for regime-aware strategy
  public entryDayEma21: number | null = null; // EMA21 value on entry day (for TP activation threshold)
  public ignitionCandleDetected: boolean = false; // Track if ignition candle was seen
  public ignitionCandleDate: string | null = null; // Date when ignition candle was detected (for 6-day expiry)
  public pullbackDetected: boolean = false; // Track if pullback to EMA21 was seen yesterday
  public pendingStopTriggerTime: Date | null = null; // Live-only: first trigger timestamp
  public pendingStopTriggerPrice: number | null = null; // Live-only: first trigger price
  public pendingStopActive: boolean = false; // Live-only: has pending stop confirmation

  // Trend tracking: consecutive days for trend confirmation
  public uptrendDays: number = 0; // Consecutive days with EMA21 slope>0 && EMA21>EMA50>EMA200
  public downtrendDays: number = 0; // Consecutive days with EMA21 slope<0 || EMA21<EMA50<EMA200
  public currentTrend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways'; // Current confirmed trend

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  updateHighestPrice(price: number): void {
    if (price > this.highestPriceSinceEntry) {
      this.highestPriceSinceEntry = price;
    }
  }

  addUnit(price: number, shares: number, stopLoss: number, rs?: number, orHigh?: number, ema21?: number): void {
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

    // Store entry day EMA21 for TP activation threshold
    if (ema21 !== undefined) {
      this.entryDayEma21 = ema21;
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
    this.highestPriceSinceEntry = 0;
    this.entryDayEma21 = null;
    this.ignitionCandleDetected = false;
    this.pullbackDetected = false;
    this.pendingStopTriggerTime = null;
    this.pendingStopTriggerPrice = null;
    this.pendingStopActive = false;
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
