import { BadRequestException, NotFoundException } from '@nestjs/common'
import { KnowledgeSnippetsService } from './knowledge-snippets.service'
import type { KnowledgeSnippet } from '../entities/knowledge-snippet.entity'

/**
 * 发布审核状态机单元测试。
 *
 * 依赖全部 mock，只验证**业务规则**：
 * - 提交 / 撤回 / 下架的合法状态迁移与非法迁移拦截；
 * - 管理员裁决（approve 进公共库 / reject 退回并记录原因）；
 * - 拒绝后必须仍能把结果返回给管理员（不能因「片段不归管理员」而 404）；
 * - `scope = mine` 要把「用户自己发布的片段」纳入、同时**不**让托管账号的
 *   3,414 条公共运营数据涌入个人工作区。
 */

type RepoMock = {
  findOne: jest.Mock
  findAndCount: jest.Mock
  update: jest.Mock
  createQueryBuilder: jest.Mock
}

function makeSnippet(overrides: Partial<KnowledgeSnippet> = {}): KnowledgeSnippet {
  return {
    id: 'snp-1',
    userId: 'user-1',
    collectionId: null,
    isPublic: false,
    moderationStatus: 'none',
    moderationNote: null,
    moderatedAt: null,
    name: '示例片段',
    description: '这是一条用于单元测试的描述，长度足够。',
    language: 'typescript',
    content: 'const a = 1;',
    displayAttrs: {},
    placeholderDefs: [],
    favorite: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    collection: null,
    tagLinks: [],
    ...overrides,
  } as unknown as KnowledgeSnippet
}

function makeQueryBuilder() {
  const qb: Record<string, jest.Mock> = {}
  const chain = [
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'addSelect',
    'setParameter',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]
  for (const name of chain) {
    qb[name] = jest.fn(() => qb)
  }
  qb.getManyAndCount = jest.fn(async () => [[], 0])
  return qb
}

function setup(options: { publicOwnerId?: string | null } = {}) {
  const snippetRepo: RepoMock = {
    findOne: jest.fn(),
    findAndCount: jest.fn(async () => [[], 0]),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
  }
  const collectionRepo = { findOne: jest.fn(), find: jest.fn() }
  const tagRepo = { find: jest.fn() }
  const tagLinkRepo = { delete: jest.fn() }
  const qb = makeQueryBuilder()
  snippetRepo.createQueryBuilder.mockReturnValue(qb)

  const ownerFindOne = jest.fn(async () =>
    options.publicOwnerId === undefined || options.publicOwnerId === null
      ? null
      : { id: options.publicOwnerId },
  )
  const dataSource = {
    // resolvePublicOwnerId 走 dataSource.getRepository(User).findOne(...)
    getRepository: jest.fn(() => ({ findOne: ownerFindOne })),
    transaction: jest.fn(),
  }
  const versionService = { writeSnapshot: jest.fn() }
  const favoritesService = { resolveFavoriteIds: jest.fn(async () => new Set<string>()) }

  const service = new KnowledgeSnippetsService(
    collectionRepo as never,
    snippetRepo as never,
    tagRepo as never,
    tagLinkRepo as never,
    dataSource as never,
    versionService as never,
    favoritesService as never,
  )

  return { service, snippetRepo, dataSource, qb, ownerFindOne }
}

describe('KnowledgeSnippetsService 发布流程（作者侧）', () => {
  it('私有片段提交发布 → moderationStatus 置 pending', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet())

    await service.submitSnippetForPublication('user-1', 'snp-1')

    expect(snippetRepo.update).toHaveBeenCalledWith(
      { id: 'snp-1' },
      expect.objectContaining({ moderationStatus: 'pending', moderatedAt: null }),
    )
  })

  it('已在公共库的片段不能再提交', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet({ isPublic: true }))

    await expect(service.submitSnippetForPublication('user-1', 'snp-1')).rejects.toThrow(
      BadRequestException,
    )
    expect(snippetRepo.update).not.toHaveBeenCalled()
  })

  it('审核中的片段不能重复提交', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet({ moderationStatus: 'pending' }))

    await expect(service.submitSnippetForPublication('user-1', 'snp-1')).rejects.toThrow(
      BadRequestException,
    )
  })

  it('被拒绝的片段可重新提交（清空上一次的拒绝结论）', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(
      makeSnippet({ moderationStatus: 'rejected', moderationNote: '内容过于简单' }),
    )

    await service.submitSnippetForPublication('user-1', 'snp-1')

    expect(snippetRepo.update).toHaveBeenCalledWith(
      { id: 'snp-1' },
      expect.objectContaining({ moderationStatus: 'pending', moderationNote: null }),
    )
  })

  it('下架已发布片段 → isPublic=false 且状态回到 none', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(
      makeSnippet({ isPublic: true, moderationStatus: 'approved' }),
    )

    await service.withdrawSnippetPublication('user-1', 'snp-1')

    expect(snippetRepo.update).toHaveBeenCalledWith(
      { id: 'snp-1' },
      expect.objectContaining({ isPublic: false, moderationStatus: 'none' }),
    )
  })

  it('撤回待审片段 → 状态回到 none', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet({ moderationStatus: 'pending' }))

    await service.withdrawSnippetPublication('user-1', 'snp-1')

    expect(snippetRepo.update).toHaveBeenCalledWith(
      { id: 'snp-1' },
      expect.objectContaining({ moderationStatus: 'none' }),
    )
  })

  it('既未发布也不在审核中的片段，撤回被拒', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet())

    await expect(service.withdrawSnippetPublication('user-1', 'snp-1')).rejects.toThrow(
      BadRequestException,
    )
  })
})

describe('KnowledgeSnippetsService 审核（管理员侧）', () => {
  it('approve → isPublic=true 且状态为 approved', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet({ moderationStatus: 'pending' }))

    await service.moderateSnippet('admin-id', 'snp-1', { action: 'approve' })

    expect(snippetRepo.update).toHaveBeenCalledWith(
      { id: 'snp-1' },
      expect.objectContaining({ isPublic: true, moderationStatus: 'approved' }),
    )
  })

  it('reject → 保持私有、状态 rejected 并记录原因', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(makeSnippet({ moderationStatus: 'pending' }))

    await service.moderateSnippet('admin-id', 'snp-1', {
      action: 'reject',
      note: '  描述与标题重复  ',
    })

    expect(snippetRepo.update).toHaveBeenCalledWith(
      { id: 'snp-1' },
      expect.objectContaining({
        isPublic: false,
        moderationStatus: 'rejected',
        moderationNote: '描述与标题重复',
      }),
    )
  })

  it('拒绝后仍返回片段结果（不因片段不归管理员而 404）', async () => {
    const { service, snippetRepo } = setup()
    // 片段归属 user-1、审核者是 admin-id：若走 getSnippet 的归属校验会误抛 404
    snippetRepo.findOne.mockResolvedValue(
      makeSnippet({ userId: 'user-1', moderationStatus: 'pending' }),
    )

    const result = await service.moderateSnippet('admin-id', 'snp-1', { action: 'reject' })

    expect(result).not.toBeNull()
    expect(result?.id).toBe('snp-1')
  })

  it('非待审状态不能重复裁决', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(
      makeSnippet({ isPublic: true, moderationStatus: 'approved' }),
    )

    await expect(
      service.moderateSnippet('admin-id', 'snp-1', { action: 'approve' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('片段不存在 → 404', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findOne.mockResolvedValue(null)

    await expect(
      service.moderateSnippet('admin-id', 'snp-404', { action: 'approve' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('队列默认查 pending，且**不按用户过滤**（管理员要看所有用户提交）', async () => {
    const { service, snippetRepo } = setup()
    snippetRepo.findAndCount.mockResolvedValue([[makeSnippet({ moderationStatus: 'pending' })], 1])

    const result = await service.listModerationQueue({})

    const arg = snippetRepo.findAndCount.mock.calls[0][0]
    expect(arg.where).toEqual({ moderationStatus: 'pending' })
    expect(arg.where.userId).toBeUndefined()
    expect(result.total).toBe(1)
  })

  it('队列可按状态回看历史（如 rejected）', async () => {
    const { service, snippetRepo } = setup()

    await service.listModerationQueue({ status: 'rejected' })

    expect(snippetRepo.findAndCount.mock.calls[0][0].where).toEqual({
      moderationStatus: 'rejected',
    })
  })
})

describe('KnowledgeSnippetsService scope = mine 分流', () => {
  it('普通用户：自己的全部片段（含已发布的）都算「我的」', async () => {
    const { service, qb } = setup({ publicOwnerId: 'admin-id' })

    await service.listSnippets('user-1', { scope: 'mine' })

    // 不含 isPublic=false 附加条件 → 已发布的片段仍可见
    expect(qb.where).toHaveBeenCalledWith('snippet.userId = :userId', { userId: 'user-1' })
  })

  it('托管账号（admin）登录：只看私有片段，避免 3,414 条运营数据涌入', async () => {
    const { service, qb } = setup({ publicOwnerId: 'admin-id' })

    await service.listSnippets('admin-id', { scope: 'mine' })

    expect(qb.where).toHaveBeenCalledWith(
      'snippet.userId = :userId AND snippet.isPublic = :notPublic',
      expect.objectContaining({ userId: 'admin-id', notPublic: false }),
    )
  })

  it('托管账号解析失败时降级为保守策略（只认私有）', async () => {
    const { service, qb } = setup({ publicOwnerId: null })

    await service.listSnippets('user-1', { scope: 'mine' })

    expect(qb.where).toHaveBeenCalledWith(
      'snippet.userId = :userId AND snippet.isPublic = :notPublic',
      expect.objectContaining({ notPublic: false }),
    )
  })

  it('未登录 → 空集（不回落成公共）', async () => {
    const { service, qb } = setup()

    await service.listSnippets(null, { scope: 'mine' })

    expect(qb.where).toHaveBeenCalledWith('1 = 0')
  })
})

describe('KnowledgeSnippetsService 列表载荷整形（P0-3 瘦身）', () => {
  it('浏览型列表**不返回** content 全文（单条省去约 73% 载荷）', async () => {
    const { service, qb } = setup({ publicOwnerId: 'admin-id' })
    qb.getManyAndCount.mockResolvedValueOnce([[makeSnippet()], 1])

    const result = await service.listSnippets('user-1', { scope: 'mine' })

    expect(result.items).toHaveLength(1)
    // 刻意「省略该键」而非置 null：省的是字节
    expect(result.items[0]).not.toHaveProperty('content')
    // 其它字段照旧，别误伤
    expect(result.items[0]).toMatchObject({ id: 'snp-1', name: '示例片段' })
  })

  it('按 ids 精确取详情时**保留** content（最近浏览 / 导出 / 命令面板依赖它）', async () => {
    const { service, qb } = setup({ publicOwnerId: 'admin-id' })
    qb.getManyAndCount.mockResolvedValueOnce([[makeSnippet()], 1])

    const result = await service.listSnippets('user-1', { ids: ['snp-1'] })

    expect(result.items[0]).toHaveProperty('content', 'const a = 1;')
  })

  it('详情接口（getSnippet）仍返回 content', async () => {
    const { service, snippetRepo } = setup({ publicOwnerId: 'admin-id' })
    snippetRepo.findOne.mockResolvedValueOnce(makeSnippet())

    const detail = await service.getSnippet('user-1', 'snp-1')

    expect(detail).toHaveProperty('content', 'const a = 1;')
  })
})
