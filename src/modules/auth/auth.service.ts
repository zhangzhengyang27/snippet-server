import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const payload = { username: user.username, sub: user.id, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  async createDefaultAdmin() {
    const existingAdmin = await this.userRepository.findOne({
      where: { username: 'admin' },
    });

    if (existingAdmin) {
      return;
    }

    const configuredPassword = (process.env.ADMIN_DEFAULT_PASSWORD || '').trim();

    // 生产环境不允许用默认/弱口令开箱启动（与 JWT_SECRET、DB_PASSWORD 同一策略）。
    // 此前只 warn：全新部署开箱即 admin/admin123，叠加 A1 的授权缺口等于把公共
    // 示例库写权限一并交出 —— 见审查报告 A4。
    if (
      process.env.NODE_ENV === 'production' &&
      (!configuredPassword || configuredPassword === 'admin123' || configuredPassword.length < 12)
    ) {
      throw new Error(
        '生产环境必须设置足够强度的 ADMIN_DEFAULT_PASSWORD（至少 12 个字符，且不能使用 admin123）',
      );
    }

    const defaultPassword = configuredPassword || 'admin123';
    if (defaultPassword === 'admin123') {
      console.warn(
        '⚠️  [安全警告] 管理员默认密码为 admin123（仅限开发环境），生产部署请通过 ADMIN_DEFAULT_PASSWORD 设置强密码。',
      );
    }

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const admin = this.userRepository.create({
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
    });

    await this.userRepository.save(admin);
    console.log('默认管理员账号已创建: admin');
  }
}
