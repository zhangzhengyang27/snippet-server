import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import type { RegisterDto } from '../../common/dtos';
import type { User } from './entities/user.entity';

/**
 * AuthService 单元测试。
 *
 * 仓库与 JwtService 全部 mock，只验证**业务规则**：
 * 注册强制 role='user'、邮箱归一化、唯一性冲突归一化为 409、
 * 登录支持用户名或邮箱、改密码的三条分支。
 *
 * 密码哈希用**真实 bcrypt**（rounds=4，仅为提速），确保 compare 路径被真正执行。
 */
type RepoMock = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'alice',
    password: bcrypt.hashSync('secret123', 4),
    role: 'user',
    email: 'alice@example.com',
    displayName: 'Alice',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

function setup() {
  const repo: RepoMock = {
    findOne: jest.fn(),
    create: jest.fn((v: Partial<User>) => ({
      id: 'new-id',
      createdAt: new Date('2026-02-02T00:00:00Z'),
      ...v,
    })),
    save: jest.fn(async (v: User) => v),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const jwt = { sign: jest.fn(() => 'signed.jwt.token') };
  const service = new AuthService(repo as never, jwt as never);
  return { service, repo, jwt };
}

const validRegister: RegisterDto = {
  username: 'alice',
  email: 'Alice@Example.com',
  password: 'secret123',
};

describe('AuthService.register', () => {
  it('创建用户时强制 role=user，并归一化邮箱为小写', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    const result = await service.register({ ...validRegister });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'alice', email: 'alice@example.com', role: 'user' }),
    );
    expect(result.user.role).toBe('user');
    expect(result.user.email).toBe('alice@example.com');
    expect(result.access_token).toBe('signed.jwt.token');
    // 绝不把 password 透出
    expect(result.user).not.toHaveProperty('password');
  });

  it('用户名已占用 → 409', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValueOnce(makeUser()).mockResolvedValueOnce(null);

    await expect(service.register({ ...validRegister })).rejects.toBeInstanceOf(ConflictException);
  });

  it('邮箱已注册 → 409', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeUser());

    await expect(service.register({ ...validRegister })).rejects.toBeInstanceOf(ConflictException);
  });

  it('唯一约束竞态（PG 23505）归一化为 409', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);
    repo.save.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(service.register({ ...validRegister })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.login', () => {
  it('用户名 + 正确密码 → 返回会话', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    const result = await service.login('alice', 'secret123');

    expect(result.access_token).toBe('signed.jwt.token');
    expect(result.user.id).toBe('user-1');
    expect(repo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({ lastLoginAt: expect.any(Date) }));
  });

  it('邮箱同样可作为登录标识（同一次 OR 查询）', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    await service.login('alice@example.com', 'secret123');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: [{ username: 'alice@example.com' }, { email: 'alice@example.com' }],
    });
  });

  it('邮箱登录大小写不敏感（输入大写也会按小写邮箱匹配）', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    await service.login('  ALICE@EXAMPLE.COM ', 'secret123');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: [{ username: 'ALICE@EXAMPLE.COM' }, { email: 'alice@example.com' }],
    });
  });

  it('密码错误 → 401', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    await expect(service.login('alice', 'wrong-pass')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('用户名不存在 → 401', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    await expect(service.login('nobody', 'secret123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.changePassword', () => {
  it('旧密码正确 → 写入新哈希（非明文）', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    await service.changePassword('user-1', 'secret123', 'brand-new-pass');

    const saved = repo.save.mock.calls[0][0] as User;
    expect(saved.password).not.toBe('brand-new-pass');
    expect(await bcrypt.compare('brand-new-pass', saved.password)).toBe(true);
  });

  it('旧密码错误 → 400', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.changePassword('user-1', 'wrong-old', 'brand-new-pass'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('新密码与旧密码相同 → 400', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeUser());

    await expect(
      service.changePassword('user-1', 'secret123', 'secret123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('用户不存在 → 401', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.changePassword('ghost', 'secret123', 'brand-new-pass'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
