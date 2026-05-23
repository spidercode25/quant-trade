import { VcpPosition } from '../models/VcpPosition';
import type { TradeSignal } from './types';

export interface VcpSignalParams {
  position: VcpPosition;
  price: number;
  open: number;
  close: number;
  high: number; // Candle high for body ratio calculation
  low: number; // Candle low for body ratio calculation
  ema21: number;
  ema50: number;
  ema200: number;
  atr: number;
  volume: number;
  vma20: number;
  vma5: number; // 5-day volume MA for TP exhaustion candle
  yesterdayVolume: number;
  orh: number;
  ema21Slope: number;
  ema50Slope?: number; // EMA50 slope for downtrend detection
  vwap?: number; // VWAP for pullback validation
  highestPriceSinceEntry: number;
  high52Week?: number; // 52-week high for TP trigger
  date?: string; // 交易日期 YYYY-MM-DD
  isLive?: boolean; // Whether this is live trading (enables 15-min stop confirmation)
  currentTime?: Date; // Current time for 15-min stop confirmation check
}

export function generateVcpSignal(
  position: VcpPosition,
  currentPrice: number,
  ema21: number,
  ema50: number,
  _ema200: number,
  _donchian20Upper: number,
  atr: number,
  _rs: number,
  _bandwidth: number,
  _orHigh: number,
  _currentVolume: number,
  _vma5: number,
  _vma10: number,
): TradeSignal;

export function generateVcpSignal(params: VcpSignalParams): TradeSignal;

export function generateVcpSignal(
  positionOrParams: VcpPosition | VcpSignalParams,
  currentPrice?: number,
  ema21?: number,
  ema50?: number,
  _ema200?: number,
  _donchian20Upper?: number,
  atr?: number,
  _rs?: number,
  _bandwidth?: number,
  _orHigh?: number,
  _currentVolume?: number,
  _vma5?: number,
  _vma10?: number,
): TradeSignal {
  let position: VcpPosition;
  let price: number;
  let open: number;
  let close: number;
  let high: number;
  let low: number;
  let ema21Val: number;
  let ema50Val: number;
  let ema200: number;
  let atrVal: number;
  let volume: number;
  let vma20: number;
  let vma5: number;
  let yesterdayVolume: number;
  let orh: number;
  let ema21Slope: number;
  let ema50Slope: number;
  let vwap: number;
  let highestPriceSinceEntry: number;
  let isLive: boolean;
  let currentTime: Date | undefined;
  let params: VcpSignalParams;

  if ('position' in positionOrParams) {
    position = positionOrParams.position;
    price = positionOrParams.price;
    open = positionOrParams.open;
    close = positionOrParams.close;
    high = positionOrParams.high;
    low = positionOrParams.low;
    ema21Val = positionOrParams.ema21;
    ema50Val = positionOrParams.ema50;
    ema200 = positionOrParams.ema200;
    atrVal = positionOrParams.atr;
    volume = positionOrParams.volume;
    vma20 = positionOrParams.vma20;
    vma5 = positionOrParams.vma5;
    yesterdayVolume = positionOrParams.yesterdayVolume;
    orh = positionOrParams.orh;
    ema21Slope = positionOrParams.ema21Slope;
    ema50Slope = positionOrParams.ema50Slope ?? 0;
    vwap = positionOrParams.vwap ?? price;
    highestPriceSinceEntry = positionOrParams.highestPriceSinceEntry;
    isLive = positionOrParams.isLive ?? false;
    currentTime = positionOrParams.currentTime;
    params = positionOrParams; // Store for high52Week access
  } else {
    position = positionOrParams;
    price = currentPrice!;
    open = currentPrice!;
    close = currentPrice!;
    high = currentPrice!;
    low = currentPrice!;
    ema21Val = ema21!;
    ema50Val = ema50!;
    ema200 = _ema200!;
    atrVal = atr!;
    volume = _currentVolume!;
    vma20 = _vma10 ?? 0;
    vma5 = _vma5 ?? 0;
    yesterdayVolume = _vma5 ?? 0;
    orh = _orHigh ?? Infinity;
    ema21Slope = 0;
    ema50Slope = 0;
    vwap = price;
    highestPriceSinceEntry = position.highestPriceSinceEntry;
    isLive = false;
    currentTime = undefined;
    // Legacy signature: construct minimal params object
    params = {
      position,
      price,
      open,
      close,
      high,
      low,
      ema21: ema21Val,
      ema50: ema50Val,
      ema200,
      atr: atrVal,
      volume,
      vma20,
      vma5,
      yesterdayVolume,
      orh,
      ema21Slope,
      highestPriceSinceEntry,
    };
  }

  // === HELPER FUNCTIONS ===

  // Calculate body ratio: abs(close-open)/(high-low)
  const calculateBodyRatio = (o: number, c: number, h: number, l: number): number => {
    const range = h - l;
    if (range <= 0) return 0;
    return Math.abs(c - o) / range;
  };

  const isBearishCandle = (o: number, c: number): boolean => c < o;
  const isBullishCandle = (o: number, c: number): boolean => c > o;
  const dateStr = params.date || '';

  // === TREND STATE DETECTION (3-day confirmation) ===
  // Update consecutive day counters and confirm trend
  const uptrendCondition = ema21Slope > 0 && ema21Val > ema50Val && ema50Val > ema200;
  const downtrendCondition = ema21Slope < 0 || (ema21Val < ema50Val && ema50Val < ema200);

  if (uptrendCondition) {
    position.uptrendDays++;
    position.downtrendDays = 0;
  } else if (downtrendCondition) {
    position.downtrendDays++;
    position.uptrendDays = 0;
  } else {
    // Neither condition met: reset both (sideways)
    position.uptrendDays = 0;
    position.downtrendDays = 0;
  }

  // Confirm trend after 3 consecutive days
  if (position.uptrendDays >= 3) {
    position.currentTrend = 'uptrend';
  } else if (position.downtrendDays >= 3) {
    position.currentTrend = 'downtrend';
  } else {
    position.currentTrend = 'sideways';
  }

  const isUptrend = position.currentTrend === 'uptrend';
  const isDowntrend = position.currentTrend === 'downtrend';
  const trendAlignment = ema21Val > ema50Val && ema50Val > ema200;

  // Debug: Log trend status around pullback zone
  if (position.pullbackDetected || (price >= ema21Val * 0.95 && price <= ema21Val * 1.1)) {
    console.log(`[${dateStr} 趋势状态] ${position.symbol} upDays=${position.uptrendDays} downDays=${position.downtrendDays} trend=${position.currentTrend} EMA21=${ema21Val.toFixed(2)} slope=${ema21Slope.toFixed(4)}`);
  }

  // === IGNITION CANDLE DETECTION (for downtrend/sideways bottom-fishing) ===
  // Ignition candle: large bullish candle + volume > 1.5 * VMA5
  // Valid for 6 days, then expires
  const isIgnitionCandle = isBullishCandle(open, close) && volume > 1.5 * vma5;

  if (!position.units && !isUptrend && isIgnitionCandle) {
    position.ignitionCandleDetected = true;
    position.ignitionCandleDate = dateStr;
    console.log(`[${dateStr} 点火柱检测] ${position.symbol} trend=${position.currentTrend} volume=${volume} vma5=${vma5}`);
  }

  // Check if ignition candle has expired (30 days)
  if (position.ignitionCandleDetected && position.ignitionCandleDate) {
    const ignitionDate = new Date(position.ignitionCandleDate);
    const currentDate = new Date(dateStr);
    const daysSinceIgnition = Math.floor((currentDate.getTime() - ignitionDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceIgnition > 30) {
      position.ignitionCandleDetected = false;
      position.ignitionCandleDate = null;
      console.log(`[${dateStr} 点火柱过期] ${position.symbol} 已超过30天`);
    }
  }

  // === EXIT LOGIC (Priority: TP > Stop-loss > Entry) ===
  if (position.units > 0) {
    // === TAKE-PROFIT: Two parallel conditions ===
    // Condition 1: Large bearish + upper shadow > 10% + volume > 2*VMA5
    // Condition 2: Near 52-week high (±1%) + upper shadow > 45% + volume > VMA5
    const bodyRatio = calculateBodyRatio(open, close, high, low);
    const candleRange = high - low;
    const upperShadow = high - Math.max(open, close);
    const upperShadowRatio = candleRange > 0 ? upperShadow / candleRange : 0;

    const isBearish = isBearishCandle(open, close);
    const isLargeBearishCandle = isBearish && bodyRatio > 2/3;
    const hasUpperShadow10 = upperShadowRatio > 0.1; // Upper shadow > 10%
    const hasUpperShadow45 = upperShadowRatio > 0.45; // Upper shadow > 45%
    const isHighVolume = volume > 2 * vma20;
    const isAboveAvgVolume = volume > vma20;

    const high52Week = params.high52Week ?? params.highestPriceSinceEntry;
    const atOrAbove52WeekHigh = high >= high52Week * 0.99; // At or within 1% of 52-week high

    // Condition 1: Anywhere - large bearish + 10% upper shadow + 2x VMA20
    const tpCondition1 = isLargeBearishCandle && hasUpperShadow10 && isHighVolume;

    // Condition 2: At or within 1% of 52-week high + bearish + 45% upper shadow + volume > VMA20
    const tpCondition2 = atOrAbove52WeekHigh && isBearish && hasUpperShadow45 && isAboveAvgVolume;

    if (tpCondition1 || tpCondition2) {
      const triggeredCondition = tpCondition1 ? 'cond1:大阴柱+上影线>10%+放量' : 'cond2:近52周新高+上影线>45%+放量';
      console.log(`[${dateStr} TP触发] ${position.symbol} 价格=${price.toFixed(2)} 条件=${triggeredCondition} bodyRatio=${(bodyRatio*100).toFixed(1)}% upperShadow=${(upperShadowRatio*100).toFixed(1)}% volume=${volume} vma20=${vma20}`);
      return { action: 'sell', reason: 'momentum_exhaustion_tp', sellProportion: 1.0 };
    }

    // Debug: log TP check when holding
    if (high >= high52Week * 0.95) {
      console.log(`[${dateStr} TP检查] ${position.symbol} isBearish=${isBearish} bodyRatio=${(bodyRatio*100).toFixed(1)}% upperShadow=${(upperShadowRatio*100).toFixed(1)}% atOrAbove52WeekHigh=${atOrAbove52WeekHigh} volume=${volume} vma20=${vma20}`);
    }

    // === STOP-LOSS: Live EMA21 Breakdown with 15-min Confirmation ===
    if (isLive && position.pendingStopActive) {
      const triggerTime = position.pendingStopTriggerTime;
      const now = currentTime ?? new Date();
      const elapsedMs = now.getTime() - (triggerTime?.getTime() ?? 0);
      const fifteenMinutesMs = 15 * 60 * 1000;

      if (elapsedMs >= fifteenMinutesMs) {
        if (price < (position.pendingStopTriggerPrice ?? Infinity)) {
          return { action: 'sell', reason: 'live_stop_loss_confirmed', sellProportion: 1.0 };
        } else {
          position.pendingStopActive = false;
          position.pendingStopTriggerTime = null;
          position.pendingStopTriggerPrice = null;
          return { action: 'hold', reason: 'stop_cancelled_price_recovered' };
        }
      } else {
        return { action: 'hold', reason: 'waiting_stop_confirmation' };
      }
    }

    const largeBearishCandleForStop = isBearishCandle(open, close) && bodyRatio > 2/3;
    const priceBreaksEma21 = price < ema21Val * 0.97;
    const slopeNegative = ema21Slope < 0;

    // Debug: log stop conditions when holding
    if (position.units > 0) {
      console.log(`[${dateStr} 止损检查] ${position.symbol} units=${position.units} price=${price.toFixed(2)} EMA21=${ema21Val.toFixed(2)} slope=${ema21Slope.toFixed(4)} bodyRatio=${(bodyRatio*100).toFixed(1)}% largeBearish=${largeBearishCandleForStop} priceBreaksEma21=${priceBreaksEma21}`);
    }

    if (slopeNegative && largeBearishCandleForStop && priceBreaksEma21) {
      if (isLive) {
        position.pendingStopActive = true;
        position.pendingStopTriggerTime = currentTime ?? new Date();
        position.pendingStopTriggerPrice = price;
        console.log(`[${dateStr} 止损待确认] ${position.symbol} 价格=${price.toFixed(2)} EMA21=${ema21Val.toFixed(2)} slope=${ema21Slope.toFixed(4)}`);
        return { action: 'hold', reason: 'pending_stop_triggered' };
      } else {
        console.log(`[${dateStr} 止损触发] ${position.symbol} 价格=${price.toFixed(2)} EMA21=${ema21Val.toFixed(2)} slope=${ema21Slope.toFixed(4)} bodyRatio=${(bodyRatio*100).toFixed(1)}%`);
        return { action: 'sell', reason: 'live_stop_loss_confirmed', sellProportion: 1.0 };
      }
    }

    return { action: 'hold', reason: 'trend_continuation' };
  }

  // === ENTRY LOGIC: Regime-Based ===

  // === DOWNTREND/SIDEWAYS: Bottom-Fishing Strategy ===
  // After ignition candle, wait for: price > EMA21 && price > EMA200 && slope > 0 && EMA21 > EMA50
  if (!isUptrend) {
    const entryConditions = position.ignitionCandleDetected 
      && price > ema21Val 
      && price > ema200
      && ema21Slope > 0 
      && ema21Val > ema50Val;
    
    if (entryConditions) {
      position.ignitionCandleDetected = false;
      position.ignitionCandleDate = null;
      console.log(`[${dateStr} 入场-抄底] ${position.symbol} 价格=${price.toFixed(2)} EMA21=${ema21Val.toFixed(2)} EMA50=${ema50Val.toFixed(2)} EMA200=${ema200.toFixed(2)} slope=${ema21Slope.toFixed(4)} 条件=点火柱+价格>EMA21+价格>EMA200+斜率>0+EMA21>EMA50`);
      return { action: 'buy', reason: 'downtrend_bottom_fishing_entry', suggestedUnits: 1, ema21: ema21Val };
    }
  }

  // === UPTREND PULLBACK ENTRY ===
  // Only valid when still in uptrend (EMA21 > EMA50, slope > 0)
  // Must have pulled back to EMA21*0.97 ~ EMA21 zone with long lower shadow

  // Priority 1: Execute pullback entry if previously detected
  // Allow entry as long as trend alignment holds (EMA21 > EMA50 > EMA200)
  // Even if slope temporarily turns negative
  if (position.pullbackDetected) {
    console.log(`[${dateStr} 回调已检测] ${position.symbol} trendAlign=${trendAlignment} slope=${ema21Slope.toFixed(4)} price=${price.toFixed(2)}`);
    if (trendAlignment && !isDowntrend) {
      position.pullbackDetected = false;
      console.log(`[${dateStr} 入场-回调] ${position.symbol} 价格=${price.toFixed(2)} EMA21=${ema21Val.toFixed(2)} EMA50=${ema50Val.toFixed(2)} slope=${ema21Slope.toFixed(4)} 条件=回调检测+趋势对齐`);
      return { action: 'buy', reason: 'uptrend_pullback_entry', suggestedUnits: 1, ema21: ema21Val };
    }
  }

  // Detect pullback: price in EMA21*0.97 ~ EMA21 zone, long lower shadow, shrinking volume
  // Only in uptrend (not in downtrend)
  if (isUptrend && !isDowntrend) {
    const pullbackZoneLower = ema21Val * 0.97;
    const pullbackZoneUpper = ema21Val;
    const priceInPullbackZone = price >= pullbackZoneLower && price <= pullbackZoneUpper;
    const lowerShadow = Math.min(open, close) - low;
    const candleRange = high - low;
    const lowerShadowRatio = candleRange > 0 ? lowerShadow / candleRange : 0;
    const hasLongLowerShadow = lowerShadowRatio > 0.1; // 下影线 > 10%
    const shrinkingVolume = volume < vma20;

    // Debug log
    if (price < ema21Val * 1.05) {
      console.log(`[${dateStr} 回调检查] ${position.symbol} price=${price.toFixed(2)} zone=${pullbackZoneLower.toFixed(2)}~${pullbackZoneUpper.toFixed(2)} inZone=${priceInPullbackZone} lowerShadow=${(lowerShadowRatio*100).toFixed(1)}% shrinking=${shrinkingVolume}`);
    }

    if (priceInPullbackZone && hasLongLowerShadow && shrinkingVolume) {
      position.pullbackDetected = true;
    }
  }

  return { action: 'hold', reason: 'waiting_for_setup' };
}
