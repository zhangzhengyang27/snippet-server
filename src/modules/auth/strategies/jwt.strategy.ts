import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const cookieExtractor = (req: Request): string | null => {
  if (!req.headers.cookie) return null;
  const cookies: Record<string, string> = {};
  req.headers.cookie.split(';').forEach((c) => {
    const [name, ...rest] = c.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  });
  return cookies['auth-token'] || null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET 环境变量未设置，服务器无法启动');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; username: string; role: string }) {
    return { userId: payload.sub, username: payload.username, role: payload.role };
  }
}
