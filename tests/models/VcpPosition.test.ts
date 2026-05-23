import { VcpPosition } from '../../src/models/VcpPosition';

describe('VcpPosition', () => {
  test('initializes with default VCP state', () => {
    const position = new VcpPosition('AAPL.US');

    expect(position.symbol).toBe('AAPL.US');
    expect(position.totalShares).toBe(0);
    expect(position.units).toBe(0);
    expect(position.entryPrices).toEqual([]);
    expect(position.stopLossPrice).toBe(0);
    expect(position.vcpStage).toBe(1);
    expect(position.orHighReference).toBeNull();
    expect(position.rsAtEntry).toBeNull();
    expect(position.highestPriceSinceEntry).toBe(0);
  });

  test('addUnit stores position data and optional references', () => {
    const position = new VcpPosition('AAPL.US');

    position.addUnit(100, 10, 95, 82, 103);

    expect(position.units).toBe(1);
    expect(position.totalShares).toBe(10);
    expect(position.entryPrices).toEqual([100]);
    expect(position.stopLossPrice).toBe(95);
    expect(position.rsAtEntry).toBe(82);
    expect(position.orHighReference).toBe(103);
  });

  test('updateHighestPrice tracks highest price since entry', () => {
    const position = new VcpPosition('AAPL.US');

    position.updateHighestPrice(100);
    expect(position.highestPriceSinceEntry).toBe(100);

    position.updateHighestPrice(105);
    expect(position.highestPriceSinceEntry).toBe(105);

    position.updateHighestPrice(102);
    expect(position.highestPriceSinceEntry).toBe(105);
  });

  test('clear resets VCP state including highestPriceSinceEntry', () => {
    const position = new VcpPosition('AAPL.US');

    position.addUnit(100, 10, 95, 82, 103);
    position.vcpStage = 3;
    position.updateHighestPrice(110);

    position.clear();

    expect(position.totalShares).toBe(0);
    expect(position.units).toBe(0);
    expect(position.entryPrices).toEqual([]);
    expect(position.stopLossPrice).toBe(0);
    expect(position.vcpStage).toBe(1);
    expect(position.orHighReference).toBeNull();
    expect(position.rsAtEntry).toBeNull();
    expect(position.highestPriceSinceEntry).toBe(0);
  });

  test('adjustForPartialSell reduces shares and clears on full exit', () => {
    const position = new VcpPosition('AAPL.US');

    position.addUnit(100, 20, 95, 82, 103);

    position.adjustForPartialSell(0.25);
    expect(position.totalShares).toBe(15);
    expect(position.units).toBe(1);
    expect(position.entryPrices).toEqual([100]);

    position.adjustForPartialSell(1);
    expect(position.totalShares).toBe(0);
    expect(position.units).toBe(0);
    expect(position.entryPrices).toEqual([]);
  });
});
