import { calculateTR, calculateATR, calculateSMA, calculateRSI, predictTargetPriceForRSI, calculateDonchianChannel, calculateVolatility } from '../src/strategy/TurtleIndicators';

describe('TurtleIndicators', () => {

  test('Test Case 1: TR Calculation', () => {
    const dayData = { open: 100, high: 105, low: 95, close: 100 };
    const prevClose = 98;
    expect(calculateTR(dayData, prevClose)).toBe(10);
  });

  test('Test Case 2: ATR Calculation', () => {
    const trValues = [10, 12, 8, 15, 11, 9, 10, 13, 14, 8, 10, 12, 11, 9];
    expect(calculateATR(trValues)).toBeCloseTo(10.86, 1);
  });

  test('Test Case 3: SMA Calculation', () => {
    const prices = [100, 102, 104, 106, 108];
    expect(calculateSMA(prices, 5)).toBe(104);
    expect(calculateSMA(prices, 3)).toBe(106);
  });

  test('Test Case 4: RSI Calculation', () => {
    const uptrend = [100, 102, 104, 106];
    expect(calculateRSI(uptrend, 2)).toBeCloseTo(100, 0);

    const downtrend = [100, 98, 96, 94];
    expect(calculateRSI(downtrend, 2)).toBeCloseTo(0, 0);

    const mixed = [100, 102, 98, 102];
    const rsi = calculateRSI(mixed, 2);
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
  });

  test('Test Case 5: predictTargetPriceForRSI', () => {
    const history = [100, 102];
    const targetPrice = predictTargetPriceForRSI(history, 2, 10);
    // targetPrice could be calculated by hand or approximated
    // We expect it to be around 84.
    if (targetPrice !== null) {
       expect(targetPrice).toBeCloseTo(84, 0);
    }
  });
});
