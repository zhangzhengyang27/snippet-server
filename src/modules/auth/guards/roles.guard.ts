import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

type RequestUser = { userId?: string; username?: string; role?: string };

/**
 * 角色守卫：与 `@Roles('admin')` 配合，限制只有指定角色可访问。
 *
 * 必须与 `RequireAuthGuard` 一起挂（顺序：先 RequireAuthGuard 再本守卫），
 * 因为 role 来自 JWT payload，只有已登录请求才存在。
 * 本守卫自身也做了未登录兜底，避免单独使用时被绕过。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 未声明 @Roles 的 handler 不归本守卫管，直接放行。
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user?.userId) {
      throw new UnauthorizedException('请先登录');
    }

    if (!user.role || !required.includes(user.role)) {
      throw new ForbiddenException('没有权限执行该操作');
    }

    return true;
  }
}
