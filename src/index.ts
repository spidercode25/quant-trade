import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { TradingBot } from './bot/TradingBot';

dotenv.config();

async function main() {
  try {
    logger.info('启动系统...');
    
    const bot = new TradingBot();
    
    // 优雅退出处理
    process.on('SIGINT', async () => {
      logger.info('接收到退出信号，正在关闭系统...');
      await bot.stop();
      process.exit(0);
    });

    await bot.start();
  } catch (error) {
    logger.error('系统启动失败:', error);
    process.exit(1);
  }
}

main();