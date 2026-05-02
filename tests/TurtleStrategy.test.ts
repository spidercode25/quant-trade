import { TurtlePosition } from '../src/models/TurtlePosition';
import { generateSignal, calculateUnitSize } from '../src/strategy/TurtleStrategy';

describe('Dual-Engine Strategy (generateSignal)', () => {
  let position: TurtlePosition;
  const donchian55 = { upper: 108, lower: 92 };
  const bb20_2_5 = { upper: 110, middle: 100, lower: 90 };
  const donchian20 = { upper: 105, lower: 90 };
  const donchian10 = { upper: 100, lower: 95 };

  beforeEach(() => {
    position = new TurtlePosition('SPY.US');
  });

  // ========================================
  // 分支A: 均值回归测试 (Volatility < 50%)
  // ========================================
  test('A1: MeanReversion - Bear Market Filter (No Entry)', () => {
    const atr = 5;
    const currentPrice = 110;
    const sma200 = 120; // 价格在长期均线下方
    const sma5 = 115;
    const rsi2 = 10; // 超卖
    const volatility = 0.20; 

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, donchian20, donchian10, atr, volatility, volatility);
    expect(signal.action).toBe('hold');
    expect(signal.reason).toContain('waiting');
  });

  test('A2: MeanReversion - Buy The Dip Entry Signal', () => {
    const atr = 5;
    const currentPrice = 130;
    const sma200 = 120; // 在均线上方
    const sma5 = 132;
    const rsi2 = 10; // 极度超卖
    const volatility = 0.20;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, donchian20, donchian10, atr, volatility, volatility);
    expect(signal.action).toBe('buy');
    expect(signal.reason).toContain('buy_pullback');
  });

  test('A3: MeanReversion - Take Profit Signal (SMA5)', () => {
    const atr = 5;
    position.addUnit(100, atr, 10);
    const currentPrice = 106;
    const sma200 = 100;
    const sma5 = 105; // 价格反弹超过5日均线
    const rsi2 = 85;
    const volatility = 0.20;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, donchian20, donchian10, atr, volatility, volatility);
    expect(signal.action).toBe('sell');
    expect(signal.reason).toContain('take_profit_overbought');
  });

  // ========================================
  // 分支B: 高波动趋势突破测试 (Volatility >= 50%)
  // ========================================
  test('B1: HighVol - Momentum Breakout Entry', () => {
    const atr = 5;
    const currentPrice = 110;
    const sma200 = 100;
    const sma5 = 105;
    const rsi2 = 55;
    const d20 = { upper: 105, lower: 90 };
    const d10 = { upper: 100, lower: 95 };
    const volatility = 0.60;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, d20, d10, atr, volatility, volatility);
    expect(signal.action).toBe('buy');
    expect(signal.reason).toContain('momentum_breakout_entry');
  });

  test('B2: HighVol - Pullback Stabilization Entry', () => {
    const atr = 5;
    const currentPrice = 96;
    const sma200 = 90;
    const sma5 = 95;
    const rsi2 = 45;
    const d20 = { upper: 110, lower: 85 };
    const d10 = { upper: 105, lower: 95 };
    const volatility = 0.60;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, d20, d10, atr, volatility, volatility);
    expect(signal.action).toBe('buy');
    expect(signal.reason).toContain('pullback_entry');
  });

  test('B3: HighVol - Trend Stop Loss', () => {
    const atr = 5;
    position.addUnit(100, atr, 10);
    const currentPrice = 75;
    const sma200 = 80;
    const sma5 = 90;
    const rsi2 = 40;
    const d20 = { upper: 105, lower: 90 };
    const d10 = { upper: 100, lower: 95 };
    const volatility = 0.60;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, d20, d10, atr, volatility, volatility);
    expect(signal.action).toBe('sell');
    expect(signal.reason).toContain('trend_stop_loss');
  });

  test('B4: HighVol - ATR Trailing Stop', () => {
    const atr = 5;
    position.addUnit(100, atr, 10);
    const currentPrice = 90;
    const sma200 = 80;
    const sma5 = 105;
    const rsi2 = 50;
    const d20 = { upper: 105, lower: 90 };
    const d10 = { upper: 100, lower: 95 };
    const volatility = 0.60;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, d20, d10, atr, volatility, volatility);
    expect(signal.action).toBe('sell');
    expect(signal.reason).toContain('atr_trailing_stop_full');
  });

  test('B5: HighVol - Profit Pyramid', () => {
    const atr = 5;
    position.addUnit(100, atr, 10);
    const currentPrice = 110;
    const sma200 = 90;
    const sma5 = 105;
    const rsi2 = 55;
    const d20 = { upper: 110, lower: 90 };
    const d10 = { upper: 108, lower: 95 };
    const volatility = 0.60;

    const signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, d20, d10, atr, volatility, volatility);
    expect(signal.action).toBe('buy');
    expect(signal.reason).toContain('profit_pyramid');
  });

  // ========================================
  // 共享逻辑与风控
  // ========================================
  test('Shared: Stop Loss Signal (2N)', () => {
    const atr = 5;
    position.addUnit(100, atr, 10); // Stop loss: 100 - 10 = 90
    const currentPrice = 88; // < 90
    const sma200 = 80;
    const sma5 = 95;
    const rsi2 = 50;
    
    // Low volatility
    let signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, donchian20, donchian10, atr, 0.20, 0.20);
    expect(signal.action).toBe('sell');
    expect(signal.reason).toContain('cut_half_2n');

    // High volatility
    signal = generateSignal(position, currentPrice, sma200, sma5, sma5, rsi2, donchian55, bb20_2_5, donchian20, donchian10, atr, 0.80, 0.80);
    expect(signal.action).toBe('sell');
    expect(signal.reason).toContain('atr_trailing_stop_full');
  });

  test('Unit Size Calculation (Adaptive Risk Multiplier)', () => {
    // 基准 2%
    expect(calculateUnitSize(10000, 5, 0.20)).toBe(40);  // 10000 * 2% / 5
    // 高波动 3%
    expect(calculateUnitSize(10000, 5, 0.60)).toBe(60);  // 10000 * 3% / 5
    // 妖股 4%
    expect(calculateUnitSize(10000, 5, 0.90)).toBe(80);  // 10000 * 4% / 5
  });
});

