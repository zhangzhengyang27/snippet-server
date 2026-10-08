import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import type { RegisterDto } from '../../common/dtos';

/** 对外返回的用户结构（**绝不含 password**）。 */
export interface PublicUser {
  id: string;
  username: string;
  role: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  /** bcrypt 代价因子（与既有 admin 初始化保持一致）。 */
  private static readonly BCRYPT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  /** 实体 → 对外结构。所有返回用户的地方都必须过这一层，避免漏出 password。 */
  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
  }

  private buildAuthResult(user: User) {
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: this.toPublicUser(user),
    };
  }

  /**
   * 校验登录凭据。
   *
   * `identifier` 可以是**用户名或邮箱**（两列都唯一），一次 OR 查询命中后比对密码。
   *
   * 🚨 邮箱必须**大小写不敏感**：注册时已把 email 统一转小写入库，若这里拿原始
   * 大小写的输入去等值匹配，`SMOKE@X.COM` 会查不到 `smoke@x.com` → 误判 401。
   * 用户名则按原样匹配（保持既有语义，用户名区分大小写）。
   */
  async validateUser(identifier: string, password: string): Promise<User | null> {
    const trimmed = identifier.trim();
    const user = await this.userRepository.findOne({
      where: [{ username: trimmed }, { email: trimmed.toLowerCase() }],
    });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(identifier: string, password: string) {
    const user = await this.validateUser(identifier, password);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 记录最近登录时间。辅助信息，失败不应阻断登录。
    const now = new Date();
    try {
      await this.userRepository.update(user.id, { lastLoginAt: now });
      user.lastLoginAt = now;
    } catch {
      /* 忽略 */
    }

    return this.buildAuthResult(user);
  }

  /**
   * 注册新用户并直接签发会话（注册即登录）。
   *
   * 🚨 `role` 必须**显式**写 'user'：线上库 `role` 列的历史默认值是 `'admin'`
   * （见 Baseline 头注释的漂移说明），一旦依赖库级默认，新用户会直接拿到管理员身份。
   */
  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

    const [existingByName, existingByEmail] = await Promise.all([
      this.userRepository.findOne({ where: { username } }),
      this.userRepository.findOne({ where: { email } }),
    ]);
    if (existingByName) {
      throw new ConflictException('该用户名已被占用');
    }
    if (existingByEmail) {
      throw new ConflictException('该邮箱已被注册');
    }

    const password = await bcrypt.hash(dto.password, AuthService.BCRYPT_ROUNDS);
    const user = this.userRepository.create({
      username,
      email,
      password,
      displayName: dto.displayName?.trim() || null,
      role: 'user',
      lastLoginAt: new Date(),
    });

    try {
      await this.userRepository.save(user);
    } catch (error) {
      // 并发注册同名/同邮箱时唯一约束会先抛 —— 归一化为 409，避免暴露 500。
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('用户名或邮箱已被占用');
      }
      throw error;
    }

    return this.buildAuthResult(user);
  }

  /**
   * 修改当前用户密码（需登录）。
   * 未做「找回密码」——那需要邮件基础设施，见本段交付说明。
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在或会话已失效');
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new BadRequestException('当前密码不正确');
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    user.password = await bcrypt.hash(newPassword, AuthService.BCRYPT_ROUNDS);
    await this.userRepository.save(user);
  }

  /** 按 id 取对外用户结构（供 /auth/me 恢复会话时补齐邮箱/展示名）。 */
  async getPublicUserById(userId: string): Promise<PublicUser | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return user ? this.toPublicUser(user) : null;
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
