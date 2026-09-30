import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * 固定窗口限流的一次命中结果。
 */
export interface RateLimitHit {
  /** 当前窗口内已累计的次数 */
  count: number;
  /** 窗口重置时间戳（毫秒） */
  resetAt: number;
}

/**
 * 限流计数存储的抽象。
 *
 * 之所以抽出这层：进程内 Map 在多实例部署 / 重启后计数即失效，
 * 达不到「登录爆破防护」的目的；而本地开发又不想强依赖 Redis。
 */
export interface RateLimitStore {
  /** 当前实现类型，用于启动日志与健康排查 */
  readonly kind: 'redis' | 'memory';
  /** 记录一次命中并返回窗口内计数 */
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
  /** 释放底层连接（应用关闭时调用） */
  close(): Promise<void>;
}

/**
 * 进程内固定窗口限流。
 *
 * 仅适用于单实例或作为 Redis 不可用时的降级方案：多实例下各算各的，
 * 实际放行量会变成「实例数 × maxAttempts」。
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly kind = 'memory' as const;
  private readonly entries = new Map<string, RateLimitHit>();

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (!existing || now >= existing.resetAt) {
      const fresh: RateLimitHit = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, fresh);
      // 惰性清理：只有新建窗口时才顺带扫描，避免每次命中都 O(n)
      this.sweep(now);
      return fresh;
    }

    existing.count += 1;
    return existing;
  }

  private sweep(now: number): void {
    if (this.entries.size < 1000) return;
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) this.entries.delete(key);
    }
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}

/**
 * 固定窗口计数的原子脚本：
 * 计数自增，首次命中时设置窗口过期；返回 [计数, 剩余毫秒]。
 * 放在 Lua 里执行可避免「INCR 成功但 PEXPIRE 失败」导致键永不过期。
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

/**
 * Redis 固定窗口限流。
 *
 * 运行期 Redis 掉线时**自动降级**到进程内计数：限流精度会下降，
 * 但绝不因为限流组件故障把登录接口整个打成 5xx。
 */
export class RedisRateLimitStore implements RateLimitStore {
  readonly kind = 'redis' as const;
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly fallback = new MemoryRateLimitStore();
  private degraded = false;

  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
  ) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    if (this.degraded) return this.fallback.hit(key, windowMs);

    try {
      const result = (await this.client.eval(
        HIT_SCRIPT,
        1,
        `${this.prefix}${key}`,
        String(windowMs),
      )) as [number | string, number | string];

      const count = Number(result[0]);
      const ttl = Number(result[1]);

      return {
        count,
        // PTTL 在键恰好过期时会返回 -2，此时按整窗兜底
        resetAt: Date.now() + (ttl > 0 ? ttl : windowMs),
      };
    } catch (error) {
      this.degraded = true;
      this.logger.error(
        `Redis 限流不可用（${(error as Error).message}），已降级为进程内计数。`,
      );
      return this.fallback.hit(key, windowMs);
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export interface CreateRateLimitStoreOptions {
  /** 'redis' | 'memory' | 'auto'（auto：配置了 REDIS_URL 才用 Redis） */
  mode: string;
  /** Redis 连接串，形如 redis://127.0.0.1:6379 */
  url?: string;
  /** 键前缀，便于与业务键隔离 */
  prefix: string;
}

/**
 * 按配置构造限流存储。
 *
 * 连接失败**不抛错**，而是打印警告并回退到进程内实现 —— 限流属于加固措施，
 * 不应成为应用启动的硬依赖（本地开发常常没起 Redis）。
 */
export async function createRateLimitStore(
  options: CreateRateLimitStoreOptions,
): Promise<RateLimitStore> {
  const logger = new Logger('RateLimitStore');
  const mode = options.mode || 'auto';
  const url = options.url;

  if (mode === 'memory' || (mode === 'auto' && !url)) {
    logger.log(
      mode === 'memory'
        ? '限流存储：进程内模式（RATE_LIMIT_STORE=memory）'
        : '限流存储：进程内模式（未配置 REDIS_URL）',
    );
    return new MemoryRateLimitStore();
  }

  if (!url) {
    logger.warn('RATE_LIMIT_STORE=redis 但未配置 REDIS_URL，回退为进程内模式。');
    return new MemoryRateLimitStore();
  }

  const client = new Redis(url, {
    lazyConnect: true,
    // 连不上就立刻失败，不排队、不无限重连 —— 让降级路径尽快生效
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  client.on('error', (error: Error) => {
    logger.warn(`Redis 连接异常：${error.message}`);
  });

  try {
    await client.connect();
    await client.ping();
    logger.log(`限流存储：Redis 模式（${options.prefix}*）`);
    return new RedisRateLimitStore(client, options.prefix);
  } catch (error) {
    logger.warn(
      `Redis 不可用（${(error as Error).message}），限流回退为进程内模式。`,
    );
    client.disconnect();
    return new MemoryRateLimitStore();
  }
}
