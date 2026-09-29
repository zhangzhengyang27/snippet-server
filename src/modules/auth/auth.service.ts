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

    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    if (defaultPassword === 'admin123') {
      console.warn('⚠️  [安全警告] 管理员默认密码为 admin123，请通过 ADMIN_DEFAULT_PASSWORD 环境变量设置强密码。');
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
