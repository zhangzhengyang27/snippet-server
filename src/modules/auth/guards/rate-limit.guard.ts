import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  RATE_LIMIT_OPTIONS,
  RATE_LIMIT_STORE,
  type RateLimitOptions,
} from '../../../common/rate-limit/rate-limit.decorator';
import type { RateLimitStore } from '../../../common/rate-limit/rate-limit-store';

/** 未显式声明 @RateLimit() 时使用的兜底参数 */
const DEFAULT_OPTIONS: RateLimitOptions = { max: 5, windowMs: 60_000 };

/**
 * 固定窗口限流守卫。
 *
 * 计数落在 `RateLimitStore` 上（Redis 或进程内），因此多实例部署时
 * 所有实例共享同一份计数 —— 这是它相对于旧版「进程内 Map」的核心改动。
 *
 * 用法：`@RateLimit({ max: 5, windowMs: 60_000 })` + `@UseGuards(RateLimitGuard)`。
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_OPTIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_OPTIONS;

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.resolveKey(context, request);

    const { count, resetAt } = await this.store.hit(key, options.windowMs);

    if (count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: options.message ?? '登录尝试次数过多，请稍后再试',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * 限流键 = **handler 标识 + 客户端 IP**。
   *
   * 🚨 必须带 handler 维度：存储层（`MemoryRateLimitStore` / Redis）只按传入的
   * key 分桶，**不认识路由**。若只用 IP 作键，同一 IP 下所有挂了 @RateLimit 的
   * 接口会**共用同一个计数器** —— 实测表现为「3 次注册后登录立刻 429」。
   * 用「类名.方法名」而非 URL：同类多路由也能自然区分。
   *
   * `req.ip` 在开启 `trust proxy` 后会优先解析 `X-Forwarded-For` 的第一跳；
   * 未开启时它是直连地址 —— 反向代理后所有请求会同 IP，等同于全局限流。
   */
  private resolveKey(context: ExecutionContext, request: Request): string {
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    return `${handler}:${ip}`;
  }
}
