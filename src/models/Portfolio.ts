interface Trade {
    type: 'BUY' | 'SELL';
    price: number;
    amount: number;
    timestamp: Date;
    reason: string;
  }
  
  export class Portfolio {
    public cash: number;
    public btcHolding: number = 0;
    public trades: Trade[] = [];
    public readonly initialCash: number;
  
    constructor(initialCash: number) {
      this.cash = initialCash;
      this.initialCash = initialCash;
    }
  
    addTrade(trade: Trade) {
      this.trades.push(trade);
    }
  
    getTotalValue(currentPrice: number): number {
      return this.cash + (this.btcHolding * currentPrice);
    }
  
    getProfitLoss(currentPrice: number): number {
      return this.getTotalValue(currentPrice) - this.initialCash;
    }
  
    getProfitLossPercent(currentPrice: number): number {
      return (this.getProfitLoss(currentPrice) / this.initialCash) * 100;
    }
  
    getTradeHistory(): Trade[] {
      return [...this.trades];
    }
  
    getStats(currentPrice: number) {
      const totalValue = this.getTotalValue(currentPrice);
      const pnl = this.getProfitLoss(currentPrice);
      const pnlPercent = this.getProfitLossPercent(currentPrice);
  
      const buyTrades = this.trades.filter(t => t.type === 'BUY');
      const sellTrades = this.trades.filter(t => t.type === 'SELL');
  
      return {
        totalValue,
        cash: this.cash,
        btcHolding: this.btcHolding,
        btcValue: this.btcHolding * currentPrice,
        pnl,
        pnlPercent,
        totalTrades: this.trades.length,
        buyTrades: buyTrades.length,
        sellTrades: sellTrades.length
      };
    }
  }