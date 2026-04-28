# AI 量化交易系统 

基于 Claude AI 的比特币量化交易程序，使用 TypeScript 编写，Yarn 管理依赖。**支持 Binance 交易所真实交易！**

## 功能特性

- ✅ **AI 智能决策**: 使用 Claude Sonnet 4 分析市场数据并做出交易决策
- 📊 **技术指标分析**: RSI、MACD、布林带、移动平均线等
- 💰 **投资组合管理**: 自动管理现金和 BTC 持仓
- 📝 **交易日志**: 完整记录所有交易和决策原因
- 🔄 **自动化交易**: 定时执行交易循环（默认5分钟）
- 🏦 **真实交易所集成**: 支持 Binance 现货交易（测试网 + 实盘）

## 交易模式

### 1. 模拟交易模式（默认）
- 不需要交易所 API
- 完全模拟，无真实资金
- 适合学习和测试策略

### 2. Binance 测试网模式
- 需要 Binance 测试网 API
- 使用测试币，无真实价值
- 完整模拟真实交易流程
- **推荐用于策略验证**

### 3. Binance 实盘模式 ⚠️
- 需要 Binance 实盘 API
- **真实资金交易**
- 高风险，需谨慎使用

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js
- **包管理**: Yarn
- **AI 服务**: Anthropic Claude API
- **市场数据**: CoinGecko API（免费）
- **交易所**: Binance（支持测试网和实盘）
- **日志**: Winston

## 安装步骤

### 1. 克隆项目并安装依赖

```bash
# 安装 Yarn (如果还没有)
npm install -g yarn

# 安装项目依赖
yarn install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

#### 模拟交易模式（推荐新手）

只需要配置 Claude API Key：

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
```

#### Binance 测试网模式（推荐学习）

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
BINANCE_API_KEY=your_testnet_api_key
BINANCE_API_SECRET=your_testnet_api_secret
EXCHANGE_TEST_MODE=true
```

**获取 Binance 测试网 API:**
1. 访问 https://testnet.binance.vision/
2. 注册账户
3. 创建 API Key

#### Binance 实盘模式 ⚠️（仅限专业用户）

```env
ANTHROPIC_API_KEY=your_claude_api_key_here
BINANCE_API_KEY=your_mainnet_api_key
BINANCE_API_SECRET=your_mainnet_api_secret
EXCHANGE_TEST_MODE=false
```

> ⚠️ **重要警告**: 实盘模式会使用真实资金！请确保：
> - 您完全理解交易风险
> - 已充分测试策略
> - API 已设置适当的权限和 IP 白名单
> - 建议使用小额资金开始

### 3. 创建日志目录

```bash
mkdir logs
```

## 回测报告

每次回测运行会自动生成 Markdown 格式的报告文件，保存在 `reports/backtests/` 目录下。

### 生成报告

```bash
# 标准回测
npm run backtest

# 诊断模式回测（包含详细信号分析）
npx ts-node src/backtest-diagnose.ts
```

### 报告文件命名

报告文件使用以下格式命名，确保每次运行的报告唯一：
```
YYYYMMDD-HHmmss-SSS__{entrypoint}__{symbol-descriptor}.md
```

例如：
- `20260428-070158-444__backtest__single-symbol.md`
- `20260428-070729-792__backtest-diagnose__multi-3.md`

如果同一秒内产生多个报告，会自动添加 `__n{counter}` 后缀避免覆盖。

### 报告内容

每个报告包含以下部分：
- **运行元数据**: 策略名称、入口点、生成时间、初始资金、股票池大小
- **运行状态**: success / no-trades / failed
- **股票池**: 参与回测的所有标的
- **分标的结果**: 每个标的的交易次数、最终资金、盈亏
- **最近交易**: 每个标的最近最多10笔交易记录
- **诊断附录**（诊断模式）: 详细的买卖信号分析，包括价格、指标、止损位等

### 日志与报告的区别

- **日志** (`logs/`)：运行时日志，由 Winston 生成，包含所有级别的日志信息
- **报告** (`reports/backtests/`)：结构化 Markdown 文档，每次回测运行生成一份，便于查看和版本控制

注意：根目录下的 `.txt` 文件是临时输出，不是正式支持的报告格式。

## 使用方法

### 开发模式

```bash
yarn dev
```

### 生产模式

```bash
# 编译 TypeScript
yarn build

# 运行编译后的代码
yarn start
```

### 代码检查

```bash
yarn lint
```

## 项目结构

```
ai-btc-trading-bot/
├── src/
│   ├── bot/
│   │   └── TradingBot.ts         # 交易机器人核心逻辑
│   ├── services/
│   │   ├── AIDecisionService.ts  # AI 决策服务
│   │   ├── MarketDataService.ts  # 市场数据服务
│   │   └── ExchangeService.ts    # 交易所集成服务 (NEW!)
│   ├── strategy/
│   │   └── TradingStrategy.ts    # 技术指标计算
│   ├── models/
│   │   └── Portfolio.ts          # 投资组合模型
│   ├── utils/
│   │   └── logger.ts             # 日志工具
│   └── index.ts                  # 程序入口
├── logs/                         # 日志文件目录
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 交易所功能说明

### ExchangeService 提供的功能

**账户管理:**
- `getBalance(asset)` - 获取指定资产余额
- `getAllBalances()` - 获取所有资产余额
- `testConnection()` - 测试交易所连接

**市场数据:**
- `getCurrentPrice(symbol)` - 获取实时价格
- `getSymbolInfo(symbol)` - 获取交易对信息

**交易功能:**
- `marketBuy(symbol, quantity)` - 市价买入
- `marketSell(symbol, quantity)` - 市价卖出
- `limitBuy(symbol, quantity, price)` - 限价买入
- `limitSell(symbol, quantity, price)` - 限价卖出

**订单管理:**
- `cancelOrder(symbol, orderId)` - 取消订单
- `getOrderStatus(symbol, orderId)` - 查询订单状态
- `getRecentTrades(symbol, limit)` - 获取历史交易

**工具函数:**
- `calculateBuyableAmount(symbol, usdtAmount)` - 计算可买入数量

## 工作流程

### 模拟交易模式
1. **获取市场数据**: 从 CoinGecko 获取 BTC 实时价格和24小时数据
2. **计算技术指标**: 计算 RSI、MACD、布林带、移动平均线等
3. **AI 分析决策**: 将市场数据和技术指标发送给 Claude AI 进行分析
4. **模拟执行交易**: 根据 AI 建议在本地模拟买入、卖出或持有操作
5. **记录日志**: 记录所有交易和决策过程

### 真实交易模式
1. **连接交易所**: 测试 Binance API 连接并同步账户余额
2. **获取市场数据**: 从 Binance 获取实时价格和交易数据
3. **计算技术指标**: 计算各种技术指标
4. **AI 分析决策**: Claude AI 分析并给出交易建议
5. **真实执行交易**: 通过 Binance API 执行市价单
6. **订单确认**: 获取订单执行结果并更新本地持仓
7. **记录日志**: 完整记录交易详情和订单 ID

## 配置说明

### 交易参数

在 `src/bot/TradingBot.ts` 中可以调整：

- **初始资金**: `new Portfolio(10000)` - 默认 $10,000
- **交易间隔**: `5 * 60 * 1000` - 默认 5 分钟
- **置信度阈值**: `decision.confidence > 0.7` - 默认 0.7

### AI 决策参数

在 `src/services/AIDecisionService.ts` 中可以调整：

- **模型版本**: `model: 'claude-sonnet-4-20250514'`
- **最大 tokens**: `max_tokens: 1000`

## 风险提示

⚠️ **极其重要 - 请务必阅读**:

### 模拟交易模式
- ✅ 安全：不涉及真实资金
- ✅ 适合学习和测试策略
- ⚠️ 注意：模拟结果可能与实际交易有差异

### Binance 测试网模式
- ✅ 安全：使用测试币，无真实价值
- ✅ 适合验证策略和熟悉流程
- ✅ 推荐在实盘前充分测试

### Binance 实盘模式 🚨
- 🚨 **高风险**：使用真实资金
- 🚨 可能导致重大财务损失
- 🚨 AI 决策可能不准确
- 🚨 市场波动可能导致快速亏损
- 🚨 技术故障可能造成损失
- 🚨 请确保：
  - 您完全理解加密货币交易风险
  - 您能够承受可能的全部损失
  - 已进行充分的测试和回测
  - 设置了合理的风险控制参数
  - API 权限仅限现货交易
  - 启用了 IP 白名单保护
  - 从小额资金开始测试

**免责声明**: 
- 本项目仅供教育和研究目的
- 开发者不对任何交易损失负责
- 使用本软件进行实盘交易的风险完全由用户承担
- 过去的表现不代表未来结果
- 不构成投资建议

## 日志说明

系统会生成以下日志文件：

- `logs/combined.log`: 所有级别的日志
- `logs/error.log`: 仅错误日志

日志包含：

- 市场价格信息
- 技术指标计算结果
- AI 决策详情
- 交易执行记录
- 账户状态更新

## 扩展功能

可以添加的功能：

### 已实现 ✅
- AI 智能决策系统
- 技术指标分析
- Binance 交易所集成
- 市价单交易
- 账户余额同步
- 完整交易日志

### 可以扩展 🔧
1. **高级订单类型**
   - 限价单自动管理
   - 止损/止盈订单
   - OCO 订单（止损限价单）

2. **风险管理**
   - 最大持仓限制
   - 每日亏损上限
   - 动态仓位管理
   - 资金管理策略

3. **策略优化**
   - 回测系统（使用历史数据）
   - 参数优化工具
   - 多策略组合
   - 策略性能分析

4. **多币种支持**
   - ETH、BNB、SOL 等
   - 多币种组合管理
   - 相关性分析

5. **监控和通知**
   - Telegram 交易提醒
   - 邮件报告
   - Web 监控面板
   - 性能仪表盘

6. **其他交易所**
   - Coinbase Pro
   - OKX
   - Kraken
   - 统一交易接口

7. **高级 AI 功能**
   - 情绪分析（Twitter、Reddit）
   - 新闻事件影响分析
   - 多模型集成决策
   - 强化学习优化

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提 Issue！
