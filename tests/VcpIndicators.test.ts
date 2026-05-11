import {
  calculateBollingerBandwidth,
  calculateMansfieldRS,
  calculateORHigh,
} from '../src/strategy/VcpIndicators';

describe('VcpIndicators', () => {
  test('calculateMansfieldRS returns relative performance ratio', () => {
    const stockPrices = [100, 110, 120];
    const benchmarkPrices = [100, 105, 110];

    expect(calculateMansfieldRS(stockPrices, benchmarkPrices, 2)).toBeCloseTo(1.0909, 4);
  });

  test('calculateMansfieldRS safely handles invalid inputs', () => {
    expect(calculateMansfieldRS([100, 110], [100], 1)).toBe(0);
    expect(calculateMansfieldRS([100, 110], [100, 110], 2)).toBe(0);
  });

  test('calculateBollingerBandwidth returns zero for flat prices', () => {
    expect(calculateBollingerBandwidth([10, 10, 10, 10, 10], 5)).toBe(0);
  });

  test('calculateBollingerBandwidth calculates normalized band width', () => {
    expect(calculateBollingerBandwidth([10, 11, 12, 13, 14], 5)).toBeCloseTo(0.5893, 4);
  });

  test('calculateORHigh returns the highest high from the first 30 minutes of the most recent day', () => {
    const candles = [
      { open: 95, high: 99, low: 94, close: 98, time: new Date('2026-05-08T15:45:00.000Z') },
      { open: 100, high: 101, low: 99, close: 100.5, time: new Date('2026-05-11T13:30:00.000Z') },
      { open: 100.5, high: 103, low: 100, close: 102.5, time: new Date('2026-05-11T13:45:00.000Z') },
      { open: 102.5, high: 110, low: 101.5, close: 102, time: new Date('2026-05-11T14:00:00.000Z') },
    ];

    expect(calculateORHigh(candles)).toBe(103);
  });

  test('calculateORHigh returns Infinity for empty candles', () => {
    expect(calculateORHigh([])).toBe(Infinity);
  });

  test('calculateORHigh returns Infinity when candles have no timestamps', () => {
    expect(
      calculateORHigh([
        { open: 100, high: 101, low: 99, close: 100.5 },
        { open: 100.5, high: 103, low: 100, close: 102.5 },
      ])
    ).toBe(Infinity);
  });
});
