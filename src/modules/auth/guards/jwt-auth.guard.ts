import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 全局 JWT 守卫（宽容模式）：
 *  - 未携带凭证：放行，request.user 为 undefined（匿名只读公共数据）
 *  - 携带凭证但无效/过期：401（避免坏 token 被当匿名造成误导）
 *  - @Public() 标记的路由完全跳过认证
 * 写接口另叠加 RequireAuthGuard 强制登录。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser | false, info: Error | undefined): TUser {
    // 无凭证：passport-jwt 以 info（NoAuthInfoFoundError / "No auth token"）而非 err 表达
    const noCredentials =
      !err && !user && !!info && /no auth/i.test(`${info.name} ${info.message ?? ''}`);
    if (noCredentials) {
      return undefined as TUser;
    }
    // 有凭证但校验失败，或 passport 内部错误：照常 401（HttpException 才能正确映射，避免 500）
    if (err || !user) {
      const message = (err as Error)?.message || info?.message || '认证失败';
      throw new UnauthorizedException(message);
    }
    return user as TUser;
  }
}
