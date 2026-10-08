import {
  Controller,
  Post,
  Put,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RequireAuthGuard } from './guards/require-auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { ChangePasswordDto, LoginDto, RegisterDto } from '../../common/dtos';

const AUTH_COOKIE = 'auth-token';

/** 会话 cookie 的统一选项（登录与注册共用，避免两处漂移）。 */
function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

/** 全局 JwtAuthGuard（宽容模式）注入的请求用户。 */
type RequestUser = { userId: string; username: string; role: string };
type AuthedRequest = Request & { user?: RequestUser };

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * 注册。注册成功即签发会话（写 cookie），前端无需再登录一次。
   * 按 IP 限流（复用 RateLimitGuard）；本段未引入图形/邮件验证码。
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @RateLimit({ max: 5, windowMs: 60_000, message: '注册过于频繁，请稍后再试' })
  @UseGuards(RateLimitGuard)
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);

    res.cookie(AUTH_COOKIE, result.access_token, authCookieOptions());

    return { user: result.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @RateLimit({ max: 5, windowMs: 60_000 })
  @UseGuards(RateLimitGuard)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto.username, loginDto.password);

    res.cookie(AUTH_COOKIE, result.access_token, authCookieOptions());

    return {
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Public()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { message: '已退出登录' };
  }

  @Post('me')
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: AuthedRequest) {
    // 归一化为与 /auth/login 相同的 user 结构（id/username/role + 档案字段）。
    // 此前原样透传 JWT payload，前端恢复会话后 user.id 变 undefined。
    // 现在补一次库查询以带回 email/displayName —— 供个人中心展示。
    if (!req.user) {
      return { user: null };
    }
    const user = await this.authService.getPublicUserById(req.user.userId);
    // 会话有效但用户已被删除：视为未登录，避免前端拿着幽灵身份。
    return { user: user ?? null };
  }

  /** 修改当前用户密码（需登录）。 */
  @Put('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireAuthGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthedRequest,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('请先登录');
    }
    await this.authService.changePassword(userId, dto.oldPassword, dto.newPassword);
    return { ok: true };
  }
}
