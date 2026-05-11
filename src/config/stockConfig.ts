const DEFAULT_STOCK_POOL = ['SPY.US', 'AAPL.US', 'TSLA.US'];
const DEFAULT_HIGH_VOL_TREND_STOCKS = ['OKLO.US', 'RIOT.US', 'TSLA.US', 'HOOD.US'];
const DEFAULT_HIGH_VOL_OSCILLATORY_STOCKS = ['COIN.US', 'PDD.US'];
const DEFAULT_VCP_STOCKS = ['NVDA.US', 'PLTR.US'];

export type HighVolSubtype = 'trend' | 'oscillatory';

function parseCommaSeparatedSymbols(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map(symbol => symbol.trim())
    .filter(symbol => symbol.length > 0);
}

export function getStockPool(): string[] {
  const parsed = parseCommaSeparatedSymbols(process.env.STOCK_POOL);
  return parsed.length > 0 ? parsed : [...DEFAULT_STOCK_POOL];
}

export function getRequestedVStocks(): string[] {
  return parseCommaSeparatedSymbols(process.env.V_STOCK);
}

export function getRequestedVcpStocks(): string[] {
  return getConfiguredSymbols(process.env.VCP_STOCKS, DEFAULT_VCP_STOCKS);
}

function getConfiguredSymbols(rawValue: string | undefined, defaults: string[]): string[] {
  const parsed = parseCommaSeparatedSymbols(rawValue);
  return parsed.length > 0 ? parsed : [...defaults];
}

export function getRequestedHighVolTrendStocks(): string[] {
  return getConfiguredSymbols(process.env.HIGH_VOL_TREND_STOCKS, DEFAULT_HIGH_VOL_TREND_STOCKS);
}

export function getRequestedHighVolOscillatoryStocks(): string[] {
  return getConfiguredSymbols(process.env.HIGH_VOL_OSCILLATORY_STOCKS, DEFAULT_HIGH_VOL_OSCILLATORY_STOCKS);
}

export function getVStocks(): Set<string> {
  const stockPool = new Set(getStockPool());
  return new Set(getRequestedVStocks().filter(symbol => stockPool.has(symbol)));
}

export function getVcpStocks(): Set<string> {
  const stockPool = new Set(getStockPool());
  return new Set(getRequestedVcpStocks().filter(symbol => stockPool.has(symbol)));
}

export function getIgnoredVStocks(): string[] {
  const stockPool = new Set(getStockPool());
  return getRequestedVStocks().filter(symbol => !stockPool.has(symbol));
}

export function getHighVolOscillatoryStocks(): Set<string> {
  const stockPool = new Set(getStockPool());
  return new Set(getRequestedHighVolOscillatoryStocks().filter(symbol => stockPool.has(symbol)));
}

export function getHighVolTrendStocks(): Set<string> {
  const stockPool = new Set(getStockPool());
  const oscillatory = getHighVolOscillatoryStocks();
  return new Set(
    getRequestedHighVolTrendStocks().filter(symbol => stockPool.has(symbol) && !oscillatory.has(symbol))
  );
}

export function getHighVolSubtype(symbol: string): HighVolSubtype {
  const requestedOscillatory = new Set(getRequestedHighVolOscillatoryStocks());
  return requestedOscillatory.has(symbol) ? 'oscillatory' : 'trend';
}

export const stockPool = getStockPool();
export const requestedVStocks = getRequestedVStocks();
export const requestedVcpStocks = getRequestedVcpStocks();
export const vStocks = getVStocks();
export const vcpStocks = getVcpStocks();
export const ignoredVStocks = getIgnoredVStocks();

export function isVStock(symbol: string): boolean {
  // 运行时重新计算，而不是使用模块加载时的静态常量
  return getVStocks().has(symbol);
}

export function isVcpStock(symbol: string): boolean {
  return getVcpStocks().has(symbol);
}
