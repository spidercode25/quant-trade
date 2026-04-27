export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  time?: Date;
}

export function calculateTR(dayData: OHLC, prevClose?: number): number {
  if (prevClose === undefined) {
    return dayData.high - dayData.low;
  }
  const hl = dayData.high - dayData.low;
  const hpc = Math.abs(dayData.high - prevClose);
  const lpc = Math.abs(dayData.low - prevClose);
  return Math.max(hl, hpc, lpc);
}

export function calculateATR(trValues: number[]): number {
  if (trValues.length === 0) return 0;
  const sum = trValues.reduce((a, b) => a + b, 0);
  return sum / trValues.length;
}

export interface DonchianChannel {
  upper: number;
  lower: number;
}

export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(prices.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const k = 2 / (period + 1);
  // Start with SMA for the first 'period' days
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }
  return ema;
}

export function calculateRSI(prices: number[], period: number): number {
  if (prices.length <= period) return 50; // default neutral if not enough data
  
  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Predict target price for RSI
 */
export function predictTargetPriceForRSI(
  historicalPrices: number[], 
  period: number, 
  targetRSI: number
): number | null {
  if (historicalPrices.length < period) return null;
  
  const lastClose = historicalPrices[historicalPrices.length - 1];
  
  let historicalGains = 0;
  let historicalLosses = 0;
  
  for (let i = historicalPrices.length - period + 1; i < historicalPrices.length; i++) {
    const diff = historicalPrices[i] - historicalPrices[i - 1];
    if (diff > 0) historicalGains += diff;
    else historicalLosses -= diff;
  }
  
  const targetRS = 100 / (100 - targetRSI) - 1;
  
  const requiredLoss = (historicalGains / targetRS) - historicalLosses;
  
  if (requiredLoss > 0) {
    return lastClose - requiredLoss;
  }
  
  const requiredGain = targetRS * historicalLosses - historicalGains;
  
  if (requiredGain > 0) {
    return lastClose + requiredGain;
  }
  
  return lastClose;
}

export function calculateDonchianChannel(highs: number[], lows: number[], period: number): DonchianChannel {
  if (highs.length < period || lows.length < period) return { upper: 0, lower: 0 };
  const recentHighs = highs.slice(highs.length - period);
  const recentLows = lows.slice(lows.length - period);
  return {
    upper: Math.max(...recentHighs),
    lower: Math.min(...recentLows)
  };
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

export function calculateStandardDeviation(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(prices.length - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
  return Math.sqrt(variance);
}

export function calculateBollingerBands(prices: number[], period: number, multiplier: number = 2.5): BollingerBands {
  const middle = calculateSMA(prices, period);
  const stdDev = calculateStandardDeviation(prices, period);
  return {
    upper: middle + multiplier * stdDev,
    middle: middle,
    lower: middle - multiplier * stdDev
  };
}

export function calculateVolatility(prices: number[], period: number = 60): number {
  if (prices.length < period + 1) return 0;
  const returns: number[] = [];
  const slice = prices.slice(prices.length - period - 1);
  for (let i = 1; i < slice.length; i++) {
    returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyVolatility = Math.sqrt(variance);
  // Annualize it (approx 252 trading days)
  return dailyVolatility * Math.sqrt(252);
}
