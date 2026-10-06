import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { LoginDto } from '../../common/dtos';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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

    res.cookie('auth-token', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Public()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('auth-token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { message: '已退出登录' };
  }

  @Post('me')
  @HttpCode(HttpStatus.OK)
  me(@Req() req: Request & { user?: { userId: string; username: string; role: string } }) {
    // 归一化为与 /auth/login 相同的 user 结构（id/username/role）。
    // JWT guard 注入的是 userId —— 此前原样透传，前端恢复会话后 user.id 变
    // undefined：顶栏/个人中心的「用户 ID」显示空白、复制按钮静默失效。
    return {
      user: req.user
        ? { id: req.user.userId, username: req.user.username, role: req.user.role }
        : null,
    };
  }
}
