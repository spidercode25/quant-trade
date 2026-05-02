const DEFAULT_STOCK_POOL = ['SPY.US', 'AAPL.US', 'TSLA.US'];

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

export function getVStocks(): Set<string> {
  const stockPool = new Set(getStockPool());
  return new Set(getRequestedVStocks().filter(symbol => stockPool.has(symbol)));
}

export function getIgnoredVStocks(): string[] {
  const stockPool = new Set(getStockPool());
  return getRequestedVStocks().filter(symbol => !stockPool.has(symbol));
}

export const stockPool = getStockPool();
export const requestedVStocks = getRequestedVStocks();
export const vStocks = getVStocks();
export const ignoredVStocks = getIgnoredVStocks();

export function isVStock(symbol: string): boolean {
  // 运行时重新计算，而不是使用模块加载时的静态常量
  return getVStocks().has(symbol);
}
