import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/** 强制登录守卫：全局宽容 JwtAuthGuard 放行的匿名请求在此拦截。 */
@Injectable()
export class RequireAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user?.userId) {
      throw new UnauthorizedException('请先登录');
    }
    return true;
  }
}
