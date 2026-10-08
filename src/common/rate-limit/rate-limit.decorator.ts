import { SetMetadata } from '@nestjs/common';
import type { RateLimitStore } from './rate-limit-store';

/**
 * 限流存储的注入令牌。
 *
 * 用字符串令牌而非类令牌：`RateLimitStore` 是接口（运行时不存在），
 * 类令牌无法表达「按配置返回 Redis 或内存实现」的工厂。
 */
export const RATE_LIMIT_STORE = 'RATE_LIMIT_STORE';

/** 存储工厂产出的实例类型（供 @Inject 处标注） */
export type RateLimitStoreToken = RateLimitStore;

/** 限流参数写入 handler 元数据的键 */
export const RATE_LIMIT_OPTIONS = 'RATE_LIMIT_OPTIONS';

export interface RateLimitOptions {
  /** 窗口内允许的最大次数 */
  max: number;
  /** 窗口长度（毫秒） */
  windowMs: number;
  /**
   * 超限时返回给用户的提示文案。
   * 缺省为「登录尝试次数过多，请稍后再试」（登录接口的历史文案）——
   * 注册等其它接口应显式给出更贴切的文案。
   */
  message?: string;
}

/**
 * 声明某个路由的限流参数，配合 `RateLimitGuard` 使用。
 *
 * 之所以用装饰器而不是 `new RateLimitGuard(5, 60_000)`：后者绕过依赖注入，
 * 守卫拿不到全局的存储实例（也就无法走 Redis）。
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS, options);
