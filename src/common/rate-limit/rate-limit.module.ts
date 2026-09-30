import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRateLimitStore, type RateLimitStore } from './rate-limit-store';
import { RATE_LIMIT_STORE } from './rate-limit.decorator';

/**
 * 限流存储模块（全局）。
 *
 * 只负责「按配置产出一个 RateLimitStore 并在关闭时释放连接」这一件事，
 * 具体的限流规则由各控制器用 `@RateLimit()` 声明。
 */
@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      useFactory: (config: ConfigService) =>
        createRateLimitStore({
          mode: config.get<string>('RATE_LIMIT_STORE') ?? 'auto',
          url: config.get<string>('REDIS_URL'),
          prefix: config.get<string>('RATE_LIMIT_PREFIX') ?? 'ratelimit:',
        }),
      inject: [ConfigService],
    },
  ],
  exports: [RATE_LIMIT_STORE],
})
export class RateLimitModule implements OnModuleDestroy {
  constructor(
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }
}
