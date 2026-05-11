import { OHLC, calculateSMA } from './TurtleIndicators';

export function calculateMansfieldRS(
  stockPrices: number[],
  benchmarkPrices: number[],
  period: number
): number {
  if (
    period <= 0 ||
    stockPrices.length !== benchmarkPrices.length ||
    stockPrices.length <= period
  ) {
    return 0;
  }

  const stockToday = stockPrices[stockPrices.length - 1];
  const stockPast = stockPrices[stockPrices.length - 1 - period];
  const benchmarkToday = benchmarkPrices[benchmarkPrices.length - 1];
  const benchmarkPast = benchmarkPrices[benchmarkPrices.length - 1 - period];

  if (stockPast === 0 || benchmarkPast === 0 || benchmarkToday === 0) {
    return 0;
  }

  const stockPerformance = stockToday / stockPast;
  const benchmarkPerformance = benchmarkToday / benchmarkPast;

  if (benchmarkPerformance === 0 || !Number.isFinite(stockPerformance) || !Number.isFinite(benchmarkPerformance)) {
    return 0;
  }

  return stockPerformance / benchmarkPerformance;
}

export function calculateBollingerBandwidth(prices: number[], period: number): number {
  if (period <= 0 || prices.length < period) {
    return 0;
  }

  const middle = calculateSMA(prices, period);
  if (middle === 0) {
    return 0;
  }

  const slice = prices.slice(prices.length - period);
  const variance = slice.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  const upper = middle + 2.5 * standardDeviation;
  const lower = middle - 2.5 * standardDeviation;

  return (upper - lower) / middle;
}

export function calculateORHigh(intradayCandles: OHLC[]): number {
  if (intradayCandles.length === 0) {
    return 0;
  }

  let highestHigh = intradayCandles[0].high;

  for (const candle of intradayCandles) {
    if (candle.high > highestHigh) {
      highestHigh = candle.high;
    }
  }

  return highestHigh;
}
