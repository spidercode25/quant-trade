import { VcpPosition } from '../src/models/VcpPosition';
import { generateVcpSignal } from '../src/strategy/VcpStrategy';

describe('VcpStrategy', () => {
  test('returns breakout entry when flat and all entry conditions are satisfied', () => {
    const position = new VcpPosition('NVDA.US');

    const signal = generateVcpSignal(position, 105, 100, 95, 2, 1.1, 0.09, 102, 1000, 500, 600);

    expect(signal).toEqual({
      action: 'buy',
      reason: 'vcp_breakout_entry',
      suggestedUnits: 1,
    });
  });

  test('returns full exit before add-on when price breaks below ema21', () => {
    const position = new VcpPosition('NVDA.US');
    position.units = 1;

    const signal = generateVcpSignal(position, 99, 100, 101, 2, 1.2, 0.05, 98, 1000, 500, 600);

    expect(signal).toEqual({
      action: 'sell',
      reason: 'ema21_break_exit',
      sellProportion: 1.0,
    });
  });

  test('holds when add-on price change is within 2 percent', () => {
    const position = new VcpPosition('NVDA.US');
    position.units = 1;
    position.entryPrices = [100];

    const signal = generateVcpSignal(position, 101, 100, 100, 2, 1.2, 0.07, 99, 1000, 500, 600);

    expect(signal).toEqual({
      action: 'hold',
      reason: 'trend_continuation',
    });
  });

  test('returns add-on signal when price change exceeds 2 percent', () => {
    const position = new VcpPosition('NVDA.US');
    position.units = 1;
    position.entryPrices = [100];

    const signal = generateVcpSignal(position, 105, 100, 103, 2, 1.2, 0.07, 99, 1000, 500, 600);

    expect(signal).toEqual({
      action: 'buy',
      reason: 'vcp_addon_pullback',
      suggestedUnits: 1,
    });
  });

  test('holds existing position when neither exit nor add-on conditions are met', () => {
    const position = new VcpPosition('NVDA.US');
    position.units = 1;

    const signal = generateVcpSignal(position, 105, 100, 95, 2, 1.3, 0.09, 104, 1000, 500, 600);

    expect(signal).toEqual({
      action: 'hold',
      reason: 'trend_continuation',
    });
  });

  test('holds flat position when setup is not ready', () => {
    const position = new VcpPosition('NVDA.US');

    // Make RS negative so it fails the breakout condition (rs > 0)
    const signal = generateVcpSignal(position, 101, 100, 95, 2, -0.5, 0.10, 102, 1000, 500, 600);

    expect(signal).toEqual({
      action: 'hold',
      reason: 'waiting_for_setup',
    });
  });
});
