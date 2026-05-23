import { VcpPosition } from '../src/models/VcpPosition';
import { generateVcpSignal, type VcpSignalParams } from '../src/strategy/VcpStrategy';

describe('VcpStrategy - Regime-Aware Dual Entry', () => {
  // === DOWNTREND BOTTOM-FISHING ENTRY ===

  describe('Downtrend bottom-fishing entry', () => {
    test('enters after ignition candle + positive slope + EMA21 > EMA50 in downtrend', () => {
      const position = new VcpPosition('NVDA.US');

      // Build 3 days of downtrend (EMA21<0 || EMA21<EMA50<EMA200)
      // Day 1: slope < 0
      generateVcpSignal({
        position,
        price: 94, open: 94, close: 94, high: 95, low: 93,
        ema21: 95, ema50: 96, ema200: 100,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 94, ema21Slope: -0.002, ema50Slope: -0.002, vwap: 94,
        highestPriceSinceEntry: 0,
      });
      // Day 2: slope < 0
      generateVcpSignal({
        position,
        price: 93, open: 93, close: 93, high: 94, low: 92,
        ema21: 94, ema50: 95, ema200: 100,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 94, ema21Slope: -0.002, ema50Slope: -0.002, vwap: 93,
        highestPriceSinceEntry: 0,
      });
      // Day 3: slope < 0, downtrend confirmed
      generateVcpSignal({
        position,
        price: 92, open: 92, close: 92, high: 93, low: 91,
        ema21: 93, ema50: 94, ema200: 100,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 94, ema21Slope: -0.002, ema50Slope: -0.002, vwap: 92,
        highestPriceSinceEntry: 0,
      });

      expect(position.currentTrend).toBe('downtrend');

      // Day 4: ignition candle in confirmed downtrend
      const ignitionParams: VcpSignalParams = {
        position,
        price: 94,
        open: 90,
        close: 95, // Bullish
        high: 96,
        low: 89,
        ema21: 92,
        ema50: 93,
        ema200: 100,
        atr: 2,
        volume: 2500, // > 2 * 1000 = 2000
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 94,
        ema21Slope: -0.001,
        ema50Slope: -0.002,
        vwap: 93,
        highestPriceSinceEntry: 0,
      };

      const ignitionSignal = generateVcpSignal(ignitionParams);
      expect(ignitionSignal.action).toBe('hold');
      expect(position.ignitionCandleDetected).toBe(true);

      // Day 5: slope turns positive, EMA21 > EMA50
      const entryParams: VcpSignalParams = {
        position,
        price: 105, // price > EMA21
        open: 97,
        close: 98,
        high: 99,
        low: 96,
        ema21: 102, // EMA21 > EMA50
        ema50: 100,
        ema200: 98,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 94,
        ema21Slope: 0.002, // Positive
        ema50Slope: -0.001,
        vwap: 97,
        highestPriceSinceEntry: 0,
      };

      const entrySignal = generateVcpSignal(entryParams);
      expect(entrySignal.action).toBe('buy');
      expect(entrySignal.reason).toBe('downtrend_bottom_fishing_entry');
    });

    test('rejects entry without ignition candle in downtrend', () => {
      const position = new VcpPosition('NVDA.US');
      // Build 3 days of downtrend
      generateVcpSignal({
        position,
        price: 94, open: 94, close: 94, high: 95, low: 93,
        ema21: 95, ema50: 96, ema200: 100,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 94, ema21Slope: -0.002, ema50Slope: -0.002, vwap: 94,
        highestPriceSinceEntry: 0,
      });
      generateVcpSignal({
        position,
        price: 93, open: 93, close: 93, high: 94, low: 92,
        ema21: 94, ema50: 95, ema200: 100,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 94, ema21Slope: -0.002, ema50Slope: -0.002, vwap: 93,
        highestPriceSinceEntry: 0,
      });
      generateVcpSignal({
        position,
        price: 92, open: 92, close: 92, high: 93, low: 91,
        ema21: 93, ema50: 94, ema200: 100,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 94, ema21Slope: -0.002, ema50Slope: -0.002, vwap: 92,
        highestPriceSinceEntry: 0,
      });
      
      const params: VcpSignalParams = {
        position,
        price: 105, // price > EMA21
        open: 97,
        close: 98,
        high: 99,
        low: 96,
        ema21: 102, // EMA21 > EMA50
        ema50: 100,
        ema200: 98,
        atr: 2,
        volume: 1200, // > 1.5 * 800 (ignition volume)
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 94,
        ema21Slope: 0.002,
        ema50Slope: -0.001,
        vwap: 97,
        highestPriceSinceEntry: 0,
      };

      const signal = generateVcpSignal(params);
      // No ignition candle detected previously, should hold
      expect(signal.action).toBe('hold');
    });
  });

  // === UPTREND PULLBACK CONTINUATION ENTRY ===

  describe('Uptrend pullback continuation entry', () => {
    test('enters on next day after valid pullback detected', () => {
      const position = new VcpPosition('NVDA.US');

      // Build 3 days of uptrend (slope > 0 && EMA21 > EMA50 > EMA200)
      // Day 1
      generateVcpSignal({
        position,
        price: 100, open: 100, close: 100, high: 101, low: 99,
        ema21: 99, ema50: 98, ema200: 95,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 100, ema21Slope: 0.002, ema50Slope: 0.001, vwap: 100,
        highestPriceSinceEntry: 0,
      });
      // Day 2
      generateVcpSignal({
        position,
        price: 101, open: 101, close: 101, high: 102, low: 100,
        ema21: 100, ema50: 98, ema200: 95,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 101, ema21Slope: 0.002, ema50Slope: 0.001, vwap: 101,
        highestPriceSinceEntry: 0,
      });
      // Day 3: uptrend confirmed
      generateVcpSignal({
        position,
        price: 103, open: 103, close: 103, high: 104, low: 102,
        ema21: 102, ema50: 99, ema200: 95,
        atr: 2, volume: 1000, vma20: 1000, vma5: 800, yesterdayVolume: 800,
        orh: 103, ema21Slope: 0.002, ema50Slope: 0.001, vwap: 103,
        highestPriceSinceEntry: 0,
      });

      expect(position.currentTrend).toBe('uptrend');

      // Day 4: Pullback detected in confirmed uptrend
      // Price in EMA21*0.97 ~ EMA21 zone, long lower shadow, shrinking volume
      const pullbackParams: VcpSignalParams = {
        position,
        price: 102, // In zone: 100.88 ~ 104
        open: 103,
        close: 102,
        high: 104,
        low: 98, // Lower shadow = 102 - 98 = 4, range = 6, ratio = 0.67 > 0.1 ✓
        ema21: 104,
        ema50: 100,
        ema200: 95,
        atr: 2,
        volume: 800, // Shrinking volume < vma20
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 106,
        ema21Slope: 0.002,
        ema50Slope: 0.001,
        vwap: 102,
        highestPriceSinceEntry: 0,
      };

      const pullbackSignal = generateVcpSignal(pullbackParams);
      expect(pullbackSignal.action).toBe('hold');
      expect(position.pullbackDetected).toBe(true);

      // Day 5: Enter at open
      const entryParams: VcpSignalParams = {
        position,
        price: 106,
        open: 106,
        close: 107,
        high: 108,
        low: 105,
        ema21: 105,
        ema50: 101,
        ema200: 96,
        atr: 2,
        volume: 1200,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 108,
        ema21Slope: 0.002,
        ema50Slope: 0.001,
        vwap: 105,
        highestPriceSinceEntry: 0,
      };

      const entrySignal = generateVcpSignal(entryParams);
      expect(entrySignal.action).toBe('buy');
      expect(entrySignal.reason).toBe('uptrend_pullback_entry');
    });

    test('rejects entry without trend alignment', () => {
      const position = new VcpPosition('NVDA.US');
      position.pullbackDetected = true;

      const params: VcpSignalParams = {
        position,
        price: 105,
        open: 104,
        close: 105,
        high: 106,
        low: 103,
        ema21: 100, // EMA21 < EMA50
        ema50: 102,
        ema200: 95,
        atr: 2,
        volume: 1500,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 104.5,
        ema21Slope: 0.002,
        ema50Slope: -0.001, // Negative slope
        vwap: 105,
        highestPriceSinceEntry: 0,
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
    });

    test('rejects pullback without shrinking volume', () => {
      const position = new VcpPosition('NVDA.US');

      const params: VcpSignalParams = {
        position,
        price: 104,
        open: 105,
        close: 104,
        high: 106,
        low: 102,
        ema21: 104,
        ema50: 100,
        ema200: 95,
        atr: 2,
        volume: 1500, // NOT shrinking ( > vma20)
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 106,
        ema21Slope: 0.002,
        ema50Slope: 0.001,
        vwap: 104.5,
        highestPriceSinceEntry: 0,
      };

      const signal = generateVcpSignal(params);
      expect(position.pullbackDetected).toBe(false);
    });
  });

  // === MOMENTUM EXHAUSTION TAKE-PROFIT ===

  describe('Momentum exhaustion take-profit', () => {
    // Condition 1: Large bearish + 10% upper shadow + 2x volume
    test('triggers TP: condition 1 - bearish + 10% shadow + 2x volume', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;

      // Not at 52-week high, but satisfies condition 1
      // Price above EMA21 to avoid stop loss
      const params: VcpSignalParams = {
        position,
        price: 125,
        open: 135, // Bearish
        close: 125, // body = 10
        high: 142, // Upper shadow = 7, range = 17, ratio = 0.41 > 0.1
        low: 125,
        ema21: 120, // Price above EMA21
        ema50: 110,
        ema200: 100,
        atr: 3,
        volume: 2000, // > 2 * 800
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 130,
        ema21Slope: 0.002, // Positive slope
        highestPriceSinceEntry: 150,
        high52Week: 160, // Not at 52-week high
      };

      // body ratio = 10/17 = 0.59 < 2/3, won't trigger
      // Need larger body
      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold'); // body too small
    });

    // Condition 1 with correct body ratio
    test('triggers TP: condition 1 with large body', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;

      const params: VcpSignalParams = {
        position,
        price: 125,
        open: 140, // Bearish
        close: 125, // body = 15
        high: 148, // Upper shadow = 8, range = 23, ratio = 0.35 > 0.1
        low: 125,
        ema21: 120,
        ema50: 110,
        ema200: 100,
        atr: 3,
        volume: 2000, // > 2 * 800
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 130,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 150,
        high52Week: 160,
      };

      // body ratio = 15/23 = 0.65 < 0.67, still too small
      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
    });

    // Condition 1 with body > 2/3
    test('triggers TP: condition 1 with body > 2/3', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;

      const params: VcpSignalParams = {
        position,
        price: 120,
        open: 140, // Bearish
        close: 120, // body = 20
        high: 145, // Upper shadow = 5, range = 25, ratio = 0.2 > 0.1
        low: 120,
        ema21: 115,
        ema50: 105,
        ema200: 95,
        atr: 3,
        volume: 2500, // > 2 * 1000 (VMA20)
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 130,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 150,
        high52Week: 160,
      };

      // body ratio = 20/25 = 0.8 > 0.67 ✓
      // upper shadow ratio = 5/25 = 0.2 > 0.1 ✓
      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('sell');
      expect(signal.reason).toBe('momentum_exhaustion_tp');
    });

    // Condition 2: 52-week high + 45% upper shadow + volume > VMA20
    test('triggers TP: condition 2 - 52-week high + 45% shadow + volume > VMA20', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;

      // Near 52-week high (±1%) with long upper shadow > 45%
      const params: VcpSignalParams = {
        position,
        price: 118,
        open: 120, // Bearish
        close: 118, // body = 2
        high: 132, // Upper shadow = 12, range = 14, ratio = 0.86 > 0.45
        low: 118,
        ema21: 110,
        ema50: 100,
        ema200: 90,
        atr: 3,
        volume: 1200, // > 1000 (VMA20)
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 120,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 140,
        high52Week: 132, // At 52-week high (within 1%)
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('sell');
      expect(signal.reason).toBe('momentum_exhaustion_tp');
    });

    test('does not trigger TP if condition 1 fails: no 10% shadow', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;

      const params: VcpSignalParams = {
        position,
        price: 124,
        open: 126, // Bearish
        close: 124, // body = 2
        high: 126, // No upper shadow (high = open)
        low: 122, // range = 4
        ema21: 120,
        ema50: 110,
        ema200: 100,
        atr: 3,
        volume: 2000, // > 2 * 800
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 120,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 140,
        high52Week: 150, // Not 52-week high
      };

      // body ratio = 2/4 = 0.5 < 0.67, not large bearish
      // upper shadow = 0 < 0.1, fails
      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
    });

    test('does not trigger TP if condition 2 fails: not 52-week high', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;

      const params: VcpSignalParams = {
        position,
        price: 118,
        open: 120,
        close: 118,
        high: 132, // 45%+ upper shadow
        low: 118,
        ema21: 110,
        ema50: 100,
        ema200: 90,
        atr: 3,
        volume: 1000, // > VMA5
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 120,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 140,
        high52Week: 150, // Not near 52-week high (132 vs 150 = 12% away)
      };

      // Condition 2 fails (not near 52-week high)
      // Condition 1: not large bearish (body=2, ratio small)
      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
    });

    test('handles zero-range candle without error', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.entryDayEma21 = 100;

      const params: VcpSignalParams = {
        position,
        price: 125,
        open: 125,
        close: 125, // Zero range
        high: 125,
        low: 125,
        ema21: 125,
        ema50: 115,
        ema200: 100,
        atr: 3,
        volume: 1500,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 800,
        orh: 124,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 130,
      };

      expect(() => generateVcpSignal(params)).not.toThrow();
      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
    });
  });

  // === LIVE STOP-LOSS ===

  describe('Live stop-loss with 15-min confirmation', () => {
    test('triggers stop in backtest mode without confirmation', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 130;

      const params: VcpSignalParams = {
        position,
        price: 95, // 3% below EMA21 = 97
        open: 100,
        close: 95, // Bearish, large body
        high: 101,
        low: 94,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 98,
        ema21Slope: -0.002, // Negative
        highestPriceSinceEntry: 130,
        isLive: false, // Backtest mode
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('sell');
      expect(signal.reason).toBe('live_stop_loss_confirmed');
    });

    test('sets pending stop in live mode', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 130;

      const triggerTime = new Date('2025-01-01T10:00:00Z');
      const params: VcpSignalParams = {
        position,
        price: 95,
        open: 100,
        close: 95,
        high: 101,
        low: 94,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 98,
        ema21Slope: -0.002,
        highestPriceSinceEntry: 130,
        isLive: true,
        currentTime: triggerTime,
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('pending_stop_triggered');
      expect(position.pendingStopActive).toBe(true);
      expect(position.pendingStopTriggerPrice).toBe(95);
    });

    test('confirms stop after 15 minutes if price lower', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 130;
      position.pendingStopActive = true;
      position.pendingStopTriggerTime = new Date('2025-01-01T10:00:00Z');
      position.pendingStopTriggerPrice = 95;

      const after15Min = new Date('2025-01-01T10:16:00Z');
      const params: VcpSignalParams = {
        position,
        price: 94, // Lower than trigger price (95)
        open: 95,
        close: 94,
        high: 96,
        low: 93,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 98,
        ema21Slope: -0.002,
        highestPriceSinceEntry: 130,
        isLive: true,
        currentTime: after15Min,
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('sell');
      expect(signal.reason).toBe('live_stop_loss_confirmed');
    });

    test('cancels stop if price recovered', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 130;
      position.pendingStopActive = true;
      position.pendingStopTriggerTime = new Date('2025-01-01T10:00:00Z');
      position.pendingStopTriggerPrice = 95;

      const after15Min = new Date('2025-01-01T10:16:00Z');
      const params: VcpSignalParams = {
        position,
        price: 96, // Higher than trigger price (95)
        open: 97,
        close: 96,
        high: 98,
        low: 95,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 98,
        ema21Slope: -0.002,
        highestPriceSinceEntry: 130,
        isLive: true,
        currentTime: after15Min,
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
      expect(signal.reason).toBe('stop_cancelled_price_recovered');
      expect(position.pendingStopActive).toBe(false);
    });

    test('does not trigger stop without large bearish candle', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 130;

      const params: VcpSignalParams = {
        position,
        price: 95,
        open: 96, // Small body
        close: 95.5,
        high: 97,
        low: 94,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 98,
        ema21Slope: -0.002,
        highestPriceSinceEntry: 130,
        isLive: false,
      };

      const signal = generateVcpSignal(params);
      expect(signal.action).toBe('hold');
    });
  });

  // === LEGACY REGRESSION TESTS ===

  describe('Legacy exit reasons removed', () => {
    test('does NOT emit trailing_stop_hit', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 110;

      const params: VcpSignalParams = {
        position,
        price: 105, // 2*ATR below highest = 110 - 4 = 106
        open: 108,
        close: 105,
        high: 109,
        low: 104,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 102,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 110,
      };

      const signal = generateVcpSignal(params);
      expect(signal.reason).not.toBe('trailing_stop_hit');
    });

    test('does NOT emit catastrophic_breakdown', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 100;

      const params: VcpSignalParams = {
        position,
        price: 100,
        open: 100,
        close: 94, // < EMA50 = 95
        high: 101,
        low: 93,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 102,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 100,
      };

      const signal = generateVcpSignal(params);
      expect(signal.reason).not.toBe('catastrophic_breakdown');
    });

    test('does NOT emit ema21_break_exit', () => {
      const position = new VcpPosition('NVDA.US');
      position.units = 1;
      position.highestPriceSinceEntry = 100;

      const params: VcpSignalParams = {
        position,
        price: 98, // < EMA21 = 100
        open: 99,
        close: 98,
        high: 100,
        low: 97,
        ema21: 100,
        ema50: 95,
        ema200: 90,
        atr: 2,
        volume: 1000,
        vma20: 1000,
        vma5: 800,
        yesterdayVolume: 500,
        orh: 102,
        ema21Slope: 0.002,
        highestPriceSinceEntry: 100,
      };

      const signal = generateVcpSignal(params);
      expect(signal.reason).not.toBe('ema21_break_exit');
    });
  });

  // === LEGACY COMPATIBILITY ===

  test('legacy signature still works for backward compatibility', () => {
    const position = new VcpPosition('NVDA.US');

    const signal = generateVcpSignal(
      position,
      105,
      100,
      95,
      90,
      100,
      2,
      1.1,
      0.09,
      102,
      1000,
      500,
      600
    );

    expect(signal.action).toBe('hold');
  });
});
