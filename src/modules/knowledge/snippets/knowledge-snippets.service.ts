import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { generateId } from '../../../common/utils/id.util'
import { clampPage, clampPageSize } from '../../../common/utils/pagination.util'
import { KnowledgeSnippet } from '../entities/knowledge-snippet.entity'
import { KnowledgeSnippetTag } from '../entities/knowledge-snippet-tag.entity'
import { KnowledgeSnippetTagLink } from '../entities/knowledge-snippet-tag-link.entity'
import { SnippetCollection } from '../entities/snippet-collection.entity'
import {
  CreateKnowledgeSnippetDto,
  CreateSnippetCollectionDto,
  ListKnowledgeSnippetsDto,
  UpdateKnowledgeSnippetDto,
  UpdateSnippetCollectionDto,
  normalizeSnippetScope,
} from './dto/knowledge-snippet.dto'
import type {
  ListModerationQueueDto,
  ModerateSnippetDto,
  SnippetScope,
} from './dto/knowledge-snippet.dto'
import {
  normalizeSnippetDisplayAttrs,
  snippetDisplayDefaults,
} from './snippet-display.util'
import { extractSnippetPlaceholderDefs } from './snippet-placeholder.util'
import { PUBLIC_OWNER_USERNAME } from './public-owner.util'
import { SnippetVersionService } from './snippet-version.service'
import { FavoritesService } from '../../favorites/favorites.service'
import { User } from '../../auth/entities/user.entity'
import type {
  SnippetDisplayAttrs,
  SnippetPlaceholderDef,
} from './snippet-types'

type ReorderCollectionInput = {
  id: string
  parentId?: string | null
  order: number
}

export type SnippetCollectionTreeNode = {
  id: string
  name: string
  parentId: string | null
  order: number
  isPublic: boolean
  createdAt: string
  updatedAt: string
  children: SnippetCollectionTreeNode[]
}

const MAX_TAG_COUNT = 20

const normalizeName = (value: string, label: string) => {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new BadRequestException(`${label}不能为空。`)
  }

  return trimmed
}

const normalizeDescription = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeLanguage = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return trimmed || snippetDisplayDefaults.language
}

const normalizeTagNames = (input?: string[]) => {
  if (!Array.isArray(input)) {
    return []
  }

  const seen = new Set<string>()
  const result: string[] = []

  for (const rawName of input) {
    const trimmed = rawName.trim()

    if (!trimmed) {
      continue
    }

    const normalized = trimmed.toLocaleLowerCase()

    if (seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(trimmed)

    if (result.length >= MAX_TAG_COUNT) {
      break
    }
  }

  return result
}

const normalizeContent = (value: string | undefined, allowFallback: string | null = null) => {
  if (typeof value === 'string') {
    return value
  }

  if (typeof allowFallback === 'string') {
    return allowFallback
  }

  throw new BadRequestException('代码内容不能为空。')
}

const normalizePlaceholderDefs = (content: string) => {
  try {
    return extractSnippetPlaceholderDefs(content)
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : '解析片段占位符失败。')
  }
}

const escapeLike = (value: string) => value.replace(/[%_\\]/g, '\\$&')

@Injectable()
export class KnowledgeSnippetsService {
  constructor(
    @InjectRepository(SnippetCollection)
    private readonly collectionRepo: Repository<SnippetCollection>,
    @InjectRepository(KnowledgeSnippet)
    private readonly snippetRepo: Repository<KnowledgeSnippet>,
    @InjectRepository(KnowledgeSnippetTag)
    private readonly tagRepo: Repository<KnowledgeSnippetTag>,
    @InjectRepository(KnowledgeSnippetTagLink)
    private readonly tagLinkRepo: Repository<KnowledgeSnippetTagLink>,
    private readonly dataSource: DataSource,
    private readonly snippetVersionService: SnippetVersionService,
    private readonly favoritesService: FavoritesService,
  ) {}

  private buildCollectionTree(
    items: Array<{
      id: string
      name: string
      parentId: string | null
      order: number
      isPublic: boolean
      createdAt: Date
      updatedAt: Date
    }>,
  ) {
    const childrenMap = new Map<string | null, SnippetCollectionTreeNode[]>()

    for (const item of items) {
      const collection: SnippetCollectionTreeNode = {
        id: item.id,
        name: item.name,
        parentId: item.parentId,
        order: item.order,
        isPublic: item.isPublic,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        children: [],
      }
      const siblings = childrenMap.get(item.parentId) ?? []
      siblings.push(collection)
      childrenMap.set(item.parentId, siblings)
    }

    const attachChildren = (parentId: string | null): SnippetCollectionTreeNode[] => {
      const nodes = childrenMap.get(parentId) ?? []

      return nodes
        .sort((left, right) => {
          if (left.order !== right.order) {
            return left.order - right.order
          }

          return left.name.localeCompare(right.name, 'zh-CN')
        })
        .map(node => ({
          ...node,
          children: attachChildren(node.id),
        }))
    }

    return attachChildren(null)
  }

  private async ensureCollectionOwned(userId: string, collectionId: string | null | undefined) {
    if (!collectionId) {
      return null
    }

    const collection = await this.collectionRepo.findOne({
      where: {
        id: collectionId,
        userId,
      },
    })

    if (!collection) {
      throw new NotFoundException('代码片段集合不存在。')
    }

    return collection
  }

  private async ensureSnippetOwned(userId: string, snippetId: string) {
    const snippet = await this.snippetRepo.findOne({
      where: {
        id: snippetId,
        userId,
      },
    })

    if (!snippet) {
      throw new NotFoundException('代码片段不存在。')
    }

    return snippet
  }

  /** 公共片段托管账号 id 的一次性缓存（见 resolvePublicOwnerId）。 */
  private publicOwnerIdCache: string | null | undefined = undefined

  /**
   * 懒解析并缓存「公共片段托管账号」（admin）的 id。
   *
   * 用途：`scope = mine` 时把「用户自己发布的片段」与「admin 名下 3,414 条运营数据」
   * 区分开 —— 前者应在「我的代码块」可见（作者要能管理 / 下架），后者绝不能涌入
   * 任何人的个人工作区（admin 登录时同理）。
   *
   * 解析失败（admin 尚未创建 / 库异常）时返回 null，调用方降级为保守策略
   * （只认 isPublic = false）—— 宁可少显示，也不炸个人工作区。
   */
  private async resolvePublicOwnerId(): Promise<string | null> {
    if (this.publicOwnerIdCache !== undefined) {
      return this.publicOwnerIdCache
    }

    const owner = await this.dataSource
      .getRepository(User)
      .findOne({ where: { username: PUBLIC_OWNER_USERNAME }, select: ['id'] })

    this.publicOwnerIdCache = owner?.id ?? null
    return this.publicOwnerIdCache
  }

  /**
   * 断言当前用户对指定集合拥有访问权：
   * 公共集合对所有人（含未登录）可见，非公共集合仅归属者可见。
   * 无访问权时抛 404（避免泄露集合的存在性）。
   */
  private assertCollectionAccessible(collection: SnippetCollection, userId: string | null) {
    if (collection.isPublic) {
      return
    }

    if (userId && collection.userId === userId) {
      return
    }

    throw new NotFoundException('代码片段集合不存在。')
  }

  /**
   * 断言当前用户对指定片段拥有访问权：
   * 公共片段对所有人（含未登录）可见，非公共片段仅归属者可见。
   */
  private assertSnippetAccessible(snippet: KnowledgeSnippet, userId: string | null) {
    if (snippet.isPublic) {
      return
    }

    if (userId && snippet.userId === userId) {
      return
    }

    throw new NotFoundException('代码片段不存在。')
  }

  /**
   * 加载集合并断言访问权；collectionId 为空时返回 null。
   * 用于读取场景（按集合筛选列表）。
   */
  private async ensureCollectionAccessible(
    userId: string | null,
    collectionId: string | null | undefined,
  ) {
    if (!collectionId) {
      return null
    }

    const collection = await this.collectionRepo.findOne({
      where: { id: collectionId },
    })

    if (!collection) {
      throw new NotFoundException('代码片段集合不存在。')
    }

    this.assertCollectionAccessible(collection, userId)

    return collection
  }

  private normalizeDisplayAttrs(
    language: string,
    input?: Partial<SnippetDisplayAttrs> | Record<string, unknown> | null,
  ) {
    return normalizeSnippetDisplayAttrs({
      ...(input ?? {}),
      language,
    })
  }

  private async syncSnippetTags(
    manager: EntityManager,
    userId: string,
    snippetId: string,
    tagNames: string[],
  ) {
    const tagRepository = manager.getRepository(KnowledgeSnippetTag)
    const linkRepository = manager.getRepository(KnowledgeSnippetTagLink)

    const normalizedNames = normalizeTagNames(tagNames)

    if (normalizedNames.length > 0) {
      for (const tagName of normalizedNames) {
        const existing = await tagRepository.findOne({
          where: { userId, name: tagName },
        })

        if (!existing) {
          await tagRepository.save(
            tagRepository.create({
              id: generateId(),
              userId,
              name: tagName,
            }),
          )
        }
      }
    }

    const tags =
      normalizedNames.length > 0
        ? await tagRepository.find({
            where: {
              userId,
              name: In(normalizedNames),
            },
          })
        : []

    await linkRepository.delete({ snippetId })

    if (tags.length > 0) {
      await linkRepository.insert(
        tags.map(tag => ({
          snippetId,
          tagId: tag.id,
          assignedAt: new Date(),
        })),
      )
    }

    await manager.query(
      `DELETE FROM ui_knowledge_snippet_tags t
       WHERE t.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM ui_knowledge_snippet_tag_links l WHERE l.tag_id = t.id
         )`,
      [userId],
    )
  }

  /**
   * 片段 → 响应 DTO。
   *
   * `includeContent` 默认 true（详情 / 审核队列 / by-ids 等「就要这几条」的场景保存全文）。
   * 浏览型列表（分页 + 无限滚动）传 false —— 列表项不返回 `content`：它占单条载荷约 73%，
   * 而列表 UI 只用标题 / 描述 / 标签（代码正文仅在选中预览、复制、导出时才需要，届时按需回查）。
   * 4,000 条规模下无限滚动会把 payload 从数 MB 压到几百 KB。
   */
  private mapSnippet(
    item: KnowledgeSnippet,
    favoriteOverride?: boolean,
    includeContent = true,
  ) {
    const displayAttrs = normalizeSnippetDisplayAttrs(
      (item.displayAttrs as Record<string, unknown> | null | undefined) ?? undefined,
    )
    const placeholderDefs = Array.isArray(item.placeholderDefs)
      ? (item.placeholderDefs as unknown as SnippetPlaceholderDef[])
      : []

    const tagLinks = [...(item.tagLinks ?? [])].sort((left, right) =>
      (left.tag?.name ?? '').localeCompare(right.tag?.name ?? ''),
    )

    // 公共片段可能是作者从**自己的私有集合**里发布出来的 —— 那个集合名属于作者的
    // 私人组织，不能出现在公共库（列表 / 详情）里。私有片段照旧显示自己的集合名。
    const collectionName =
      item.collection && (!item.isPublic || item.collection.isPublic)
        ? item.collection.name
        : null

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      language: item.language,
      // 列表模式刻意省略该键（不是置 null）：省的是字节，不是语义。
      ...(includeContent ? { content: item.content } : {}),
      isPublic: item.isPublic,
      moderationStatus: item.moderationStatus ?? 'none',
      moderationNote: item.moderationNote ?? null,
      moderatedAt: item.moderatedAt?.toISOString() ?? null,
      displayAttrs,
      placeholderDefs,
      // 收藏是**按用户**的：能算出来就用收藏表的结论覆盖那一列全局旧标记
      favorite: favoriteOverride ?? item.favorite,
      usageCount: item.usageCount,
      lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      collectionId: item.collectionId ?? item.collection?.id ?? null,
      collectionName,
      tags: tagLinks.map(link => link.tag?.name).filter(Boolean) as string[],
    }
  }

  async listCollectionsTree(userId: string | null, scope: SnippetScope = 'all') {
    // 作用域语义与 listSnippets 保持一致，否则侧栏集合树与右侧列表会互相打架：
    // - mine   仅个人集合（未登录 → 空树）
    // - public 仅公共集合
    // - all    个人 + 公共（未登录仅公共）
    if (scope === 'mine' && !userId) {
      return []
    }

    const where: FindOptionsWhere<SnippetCollection>[] =
      scope === 'mine'
        ? // 与 listSnippets 同口径：个人的 = 归属当前用户且非公共（公共集合归 null 账号）
          [{ userId: userId ?? undefined, isPublic: false }]
        : scope === 'public'
          ? [{ isPublic: true }]
          : userId
            ? [{ userId }, { isPublic: true }]
            : [{ isPublic: true }]

    const collections = await this.collectionRepo.find({
      where,
      order: {
        parentId: 'ASC',
        order: 'ASC',
        createdAt: 'ASC',
      },
    })

    return this.buildCollectionTree(collections)
  }

  async createCollection(userId: string, payload: CreateSnippetCollectionDto) {
    const name = normalizeName(payload.name, '集合名称')
    const parent = await this.ensureCollectionOwned(userId, payload.parentId ?? null)
    const siblingCount = await this.collectionRepo.count({
      where: {
        userId,
        parentId: parent?.id ?? IsNull(),
      },
    })

    const created = await this.collectionRepo.save(
      this.collectionRepo.create({
        id: generateId(),
        userId,
        parentId: parent?.id ?? null,
        name,
        order: siblingCount,
      }),
    )

    return {
      id: created.id,
      name: created.name,
      parentId: created.parentId ?? null,
      order: created.order,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    }
  }

  async updateCollection(userId: string, id: string, payload: UpdateSnippetCollectionDto) {
    const current = await this.ensureCollectionOwned(userId, id)

    if (!current) {
      throw new NotFoundException('代码片段集合不存在。')
    }

    if (!payload.name?.trim()) {
      return {
        id: current.id,
        name: current.name,
        parentId: current.parentId ?? null,
        order: current.order,
        createdAt: current.createdAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      }
    }

    await this.collectionRepo.update(
      { id },
      { name: normalizeName(payload.name, '集合名称') },
    )

    const updated = await this.collectionRepo.findOneOrFail({ where: { id } })

    return {
      id: updated.id,
      name: updated.name,
      parentId: updated.parentId ?? null,
      order: updated.order,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }

  async reorderCollections(
    userId: string,
    items: ReorderCollectionInput[],
    scope: SnippetScope = 'all',
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      return this.listCollectionsTree(userId, scope)
    }

    const collections = await this.collectionRepo.find({
      where: { userId },
    })

    const allIds = new Set(collections.map(item => item.id))
    const nextParentById = new Map(collections.map(item => [item.id, item.parentId ?? null]))

    for (const item of items) {
      if (!allIds.has(item.id)) {
        throw new NotFoundException('存在无效的集合标识。')
      }

      if (item.parentId && !allIds.has(item.parentId)) {
        throw new NotFoundException('存在无效的父级集合。')
      }

      nextParentById.set(item.id, item.parentId ?? null)
    }

    const seen = new Set<string>()
    const inStack = new Set<string>()

    const visit = (id: string) => {
      if (inStack.has(id)) {
        throw new BadRequestException('集合层级存在循环引用，请调整拖拽结果后重试。')
      }

      if (seen.has(id)) {
        return
      }

      inStack.add(id)
      const parentId = nextParentById.get(id) ?? null

      if (parentId) {
        if (parentId === id) {
          throw new BadRequestException('集合不能移动到自身之下。')
        }

        visit(parentId)
      }

      inStack.delete(id)
      seen.add(id)
    }

    for (const id of allIds) {
      visit(id)
    }

    await this.dataSource.transaction(async manager => {
      const repository = manager.getRepository(SnippetCollection)

      for (const item of items) {
        await repository.update(
          { id: item.id },
          {
            parentId: item.parentId ?? null,
            order: item.order,
          },
        )
      }
    })

    return this.listCollectionsTree(userId, scope)
  }

  async deleteCollection(userId: string, id: string) {
    await this.ensureCollectionOwned(userId, id)

    const [childCount, snippetCount] = await Promise.all([
      this.collectionRepo.count({
        where: {
          userId,
          parentId: id,
        },
      }),
      this.snippetRepo.count({
        where: {
          userId,
          collectionId: id,
        },
      }),
    ])

    if (childCount > 0 || snippetCount > 0) {
      throw new BadRequestException('集合下仍有子集合或代码片段，请先清空后再删除。')
    }

    await this.collectionRepo.delete({ id })

    return { ok: true }
  }

  async listTags(userId: string | null) {
    // 标签为用户私有数据，未登录用户没有标签
    if (!userId) {
      return { items: [] }
    }

    const items = await this.tagRepo.find({
      where: { userId },
      relations: ['snippets'],
      order: { name: 'ASC' },
    })

    return {
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        count: item.snippets?.length ?? 0,
        updatedAt: item.updatedAt.toISOString(),
      })),
    }
  }

  /**
   * 收集指定集合及其所有后代集合的 id（包含自身）。
   */
  private collectDescendantCollectionIds(
    rootId: string,
    collections: Array<{ id: string; parentId: string | null }>,
  ) {
    const childrenMap = new Map<string | null, string[]>()

    for (const collection of collections) {
      const siblings = childrenMap.get(collection.parentId) ?? []
      siblings.push(collection.id)
      childrenMap.set(collection.parentId, siblings)
    }

    const result: string[] = []
    const walk = (id: string) => {
      result.push(id)
      for (const childId of childrenMap.get(id) ?? []) {
        walk(childId)
      }
    }
    walk(rootId)

    return result
  }

  /**
   * 获取按集合筛选时应包含的集合 id 列表（含所有后代）。
   */
  private async getCollectionIdFilter(userId: string | null, collectionId: string) {
    const where = userId ? [{ userId }, { isPublic: true }] : [{ isPublic: true }]
    const collections = await this.collectionRepo.find({
      where,
      select: ['id', 'parentId'],
    })

    return this.collectDescendantCollectionIds(collectionId, collections)
  }

  async listSnippets(userId: string | null, query: ListKnowledgeSnippetsDto = {}) {
    const page = clampPage(query.page)
    const pageSize = clampPageSize(query.pageSize)
    const keyword = query.q?.trim()

    if (query.collectionId) {
      await this.ensureCollectionAccessible(userId, query.collectionId)
    }

    const qb = this.snippetRepo
      .createQueryBuilder('snippet')
      .leftJoinAndSelect('snippet.collection', 'collection')
      .leftJoinAndSelect('snippet.tagLinks', 'tagLinks')
      .leftJoinAndSelect('tagLinks.tag', 'tag')

    // 数据作用域：
    // - mine   仅个人（未登录 → 空集），个人工作区 /snippets 用
    // - public 仅公共，公共代码块库 /library 用
    // - all    默认「个人 + 公共」混合（未登录仅公共），兼容收藏夹 / 最近浏览等旧调用方
    const scope = normalizeSnippetScope(query.scope)
    if (scope === 'mine') {
      if (userId) {
        // 「我的」= 我建的片段，**含我自己发布到公共库的**（作者要能管理 / 下架它）。
        //
        // ⚠️ 但不能无条件写成 `userId = :userId`：公共片段的归属是**托管账号**（admin），
        // 而它名下有 3,414 条运营数据 —— 那样 admin 一登录，个人工作区就会被公共库淹没。
        // 所以按「当前登录者是否托管账号」分流：
        //   - 是托管账号 → 只看私有片段（公共内容去 /library）；
        //   - 普通用户   → 自己的全部；托管账号那批数据不满足 `userId = :userId`，
        //                 天然被排除，不需要额外条件。
        // 托管账号解析失败时降级为保守策略（只认私有），宁可少显示也不误捞公共数据。
        const publicOwnerId = await this.resolvePublicOwnerId()
        const includePublished = Boolean(publicOwnerId) && publicOwnerId !== userId

        if (includePublished) {
          qb.where('snippet.userId = :userId', { userId })
        } else {
          qb.where('snippet.userId = :userId AND snippet.isPublic = :notPublic', {
            userId,
            notPublic: false,
          })
        }
      } else {
        // 未登录没有个人片段：命中恒假条件，返回空集（而不是回退成「公共」）
        qb.where('1 = 0')
      }
    } else if (scope === 'public') {
      qb.where('snippet.isPublic = :isPublic', { isPublic: true })
    } else if (userId) {
      qb.where('(snippet.userId = :userId OR snippet.isPublic = :isPublic)', {
        userId,
        isPublic: true,
      })
    } else {
      qb.where('snippet.isPublic = :isPublic', { isPublic: true })
    }

    if (query.collectionId) {
      const collectionIds = await this.getCollectionIdFilter(userId, query.collectionId)
      qb.andWhere('snippet.collectionId IN (:...collectionIds)', { collectionIds })
    }

    // 「只看收藏」按**用户收藏表**过滤，而不是那列全局旧标记：
    // `snippet.favorite` 是全局布尔列，任何人收藏都会置 true，无法表达「我的收藏」。
    if (typeof query.favorite === 'boolean') {
      if (!userId) {
        // 未登录没有收藏：请求 favorite=true 时命中一个恒假条件（等价于空集）
        if (query.favorite) qb.andWhere('1 = 0')
      } else if (query.favorite) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM favorites fav
                   WHERE fav.snippet_id = snippet.id AND fav.user_id = :favFilterUserId)`,
          { favFilterUserId: userId },
        )
      } else {
        qb.andWhere(
          `NOT EXISTS (SELECT 1 FROM favorites fav
                       WHERE fav.snippet_id = snippet.id AND fav.user_id = :favFilterUserId)`,
          { favFilterUserId: userId },
        )
      }
    }

    // 按 id 批量取详情（「最近浏览」等先有 id 列表的场景），把前端的 N 次回查压成 1 次。
    // 可见性约束仍由上面的 where 保证 —— 拿不到无权访问的片段。
    if (query.ids?.length) {
      qb.andWhere('snippet.id IN (:...ids)', { ids: query.ids })
    }

    if (query.tag?.trim()) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM ui_knowledge_snippet_tag_links link
           INNER JOIN ui_knowledge_snippet_tags tag ON tag.id = link.tag_id
           WHERE link.snippet_id = snippet.id AND tag.name = :tagName
         )`,
        { tagName: query.tag.trim() },
      )
    }

    if (keyword) {
      const like = `%${escapeLike(keyword.toLowerCase())}%`
      qb.andWhere(
        `(
           LOWER(snippet.name) LIKE :like
           OR LOWER(snippet.description) LIKE :like
           OR LOWER(snippet.content) LIKE :like
           OR EXISTS (
             SELECT 1 FROM ui_knowledge_snippet_tag_links link
             INNER JOIN ui_knowledge_snippet_tags tag ON tag.id = link.tag_id
             WHERE link.snippet_id = snippet.id AND LOWER(tag.name) LIKE :like
           )
         )`,
        { like },
      )
    }

    // 默认把「当前用户收藏的」排在最前（按用户，不再是那列全局标记）。
    // 未登录没有收藏，直接交给下面的 addOrderBy 决定顺序。
    //
    // 注意：**不能把原始 SQL 直接塞进 orderBy** —— 分页（skip/take + join）时
    // TypeORM 会按 `.` 拆分 orderBy 表达式去查 join 别名，含点号的原始 SQL
    // （如 `fav.snippet_id`）会被当成 `别名.属性` 解析而抛出 TypeORMError → 500。
    // 改为先 addSelect 成具名别名再按别名排序：别名不含 `.`，走 TypeORM 的安全分支。
    if (userId) {
      qb.addSelect(
        `CASE WHEN EXISTS (SELECT 1 FROM favorites fav
                           WHERE fav.snippet_id = snippet.id AND fav.user_id = :favoriteOrderUserId)
              THEN 0 ELSE 1 END`,
        'favorite_rank',
      )
      qb.setParameter('favoriteOrderUserId', userId)
      qb.orderBy('favorite_rank', 'ASC')
    }

    if (query.sort === 'name') {
      qb.addOrderBy('snippet.name', 'ASC')
    } else if (query.sort === 'updatedAt') {
      qb.addOrderBy('snippet.updatedAt', 'DESC')
    } else {
      qb.addOrderBy('snippet.lastUsedAt', 'DESC', 'NULLS LAST')
      qb.addOrderBy('snippet.updatedAt', 'DESC')
    }

    // 指定 ids 时**不套分页**：这是一次「就要这些」的精确请求，
    // 套上 pageSize 只会造成静默截断（pageSize 上限 100，而 id 列表可能更长）。
    if (!query.ids?.length) {
      qb.skip((page - 1) * pageSize).take(pageSize)
    }

    const [items, total] = await qb.getManyAndCount()
    // 一次性把本页片段的「我是否收藏」查出来，避免逐条判断产生 N+1
    const favoriteIds = await this.favoritesService.resolveFavoriteIds(
      userId,
      items.map(item => item.id),
    )

    // 浏览型列表（分页 / 无限滚动）不回传 content 全文以缩小载荷；
    // 而 `ids` 是一次「就要这几条」的精确请求（最近浏览 / 导出 / 命令面板），保留全文。
    const includeContent = Boolean(query.ids?.length)

    return {
      items: items.map(item =>
        this.mapSnippet(item, favoriteIds.has(item.id), includeContent),
      ),
      total,
      page,
      pageSize,
    }
  }

  async getSnippet(userId: string | null, id: string) {
    const item = await this.snippetRepo.findOne({
      where: { id },
      relations: ['collection', 'tagLinks', 'tagLinks.tag'],
    })

    if (!item) {
      throw new NotFoundException('代码片段不存在。')
    }

    this.assertSnippetAccessible(item, userId)

    // 详情页的收藏态同样是按用户的（公共片段也能被非归属者收藏）
    const favoriteIds = await this.favoritesService.resolveFavoriteIds(userId, [item.id])
    return this.mapSnippet(item, favoriteIds.has(item.id))
  }

  async createSnippet(userId: string, payload: CreateKnowledgeSnippetDto) {
    const name = normalizeName(payload.name, '片段名称')
    const description = normalizeDescription(payload.description)
    const collection = await this.ensureCollectionOwned(userId, payload.collectionId ?? null)
    const content = normalizeContent(payload.content)
    const displayLanguage =
      typeof payload.displayAttrs?.language === 'string' ? payload.displayAttrs.language : undefined
    const language = normalizeLanguage(payload.language ?? displayLanguage)
    const displayAttrs = this.normalizeDisplayAttrs(language, payload.displayAttrs)
    const placeholderDefs = normalizePlaceholderDefs(content)
    const favorite = Boolean(payload.favorite)
    const tagNames = normalizeTagNames(payload.tags)

    const created = await this.dataSource.transaction(async manager => {
      const snippetRepository = manager.getRepository(KnowledgeSnippet)

      const snippet = await snippetRepository.save(
        snippetRepository.create({
          id: generateId(),
          userId,
          collectionId: collection?.id ?? null,
          name,
          description,
          language,
          content,
          displayAttrs: displayAttrs as unknown as Record<string, unknown>,
          placeholderDefs: placeholderDefs as unknown as unknown[],
          favorite,
        }),
      )

      await this.syncSnippetTags(manager, userId, snippet.id, tagNames)

      // 版本历史：创建时写入首个快照（与片段同事务，避免正文与历史不一致）
      await this.snippetVersionService.writeSnapshot(manager, snippet, userId, 'create')

      return snippet
    })

    return this.getSnippet(userId, created.id)
  }

  async updateSnippet(userId: string, id: string, payload: UpdateKnowledgeSnippetDto) {
    const current = await this.ensureSnippetOwned(userId, id)
    const nextCollectionId =
      payload.collectionId === undefined
        ? (current.collectionId ?? null)
        : (payload.collectionId ?? null)

    await this.ensureCollectionOwned(userId, nextCollectionId)

    const language = normalizeLanguage(
      payload.language ??
        (payload.displayAttrs?.language as string | undefined) ??
        current.language,
    )
    const currentDisplayAttrs = normalizeSnippetDisplayAttrs(
      (current.displayAttrs as Record<string, unknown> | null | undefined) ?? undefined,
    )
    const displayAttrs = this.normalizeDisplayAttrs(language, {
      ...currentDisplayAttrs,
      ...payload.displayAttrs,
    })
    const content = payload.content ?? current.content
    const placeholderDefs =
      payload.content !== undefined
        ? normalizePlaceholderDefs(content)
        : Array.isArray(current.placeholderDefs)
          ? (current.placeholderDefs as unknown as SnippetPlaceholderDef[])
          : []
    const favorite = payload.favorite !== undefined ? Boolean(payload.favorite) : current.favorite
    const tagNames = payload.tags !== undefined ? normalizeTagNames(payload.tags) : undefined

    // 提取成局部变量：既要用于 update，也要用于写版本快照，避免两处表达式各写一遍
    const nextName = payload.name ?? current.name
    const nextDescription =
      payload.description !== undefined
        ? normalizeDescription(payload.description)
        : current.description

    // 已发布片段被改动「内容类字段」后回到待复审：否则作者可以「先发布合规内容、
    // 通过后再改成违规内容」绕过审核。只改收藏 / 集合归属不触发（那不是内容变更）。
    // isPublic 特意保持不变 —— 内容继续可见，但会重新出现在管理员队列里待复查。
    const contentTouched =
      payload.name !== undefined ||
      payload.description !== undefined ||
      payload.content !== undefined ||
      payload.language !== undefined ||
      payload.displayAttrs !== undefined ||
      payload.tags !== undefined
    const publicationOverride =
      current.isPublic && contentTouched ? { moderationStatus: 'pending' as const } : {}

    await this.dataSource.transaction(async manager => {
      const snippetRepository = manager.getRepository(KnowledgeSnippet)

      await snippetRepository.update(
        { id },
        {
          name: nextName,
          description: nextDescription,
          language,
          collectionId: nextCollectionId,
          content,
          displayAttrs,
          placeholderDefs,
          favorite,
          ...publicationOverride,
        } as never,
      )

      if (tagNames !== undefined) {
        await this.syncSnippetTags(manager, userId, id, tagNames)
      }

      // 版本历史：写入「更新后」的快照（与片段同事务）。
      // 因此回滚到这一版 = 回到这次更新的结果。
      await this.snippetVersionService.writeSnapshot(
        manager,
        {
          id,
          name: nextName,
          description: nextDescription,
          language,
          content,
          displayAttrs: displayAttrs as unknown as Record<string, unknown>,
        },
        userId,
        'update',
      )
    })

    return this.getSnippet(userId, id)
  }

  async deleteSnippet(userId: string, id: string) {
    await this.ensureSnippetOwned(userId, id)

    await this.dataSource.transaction(async manager => {
      await manager.getRepository(KnowledgeSnippetTagLink).delete({ snippetId: id })
      await manager.getRepository(KnowledgeSnippet).delete({ id })
    })

    return { ok: true }
  }

  /**
   * 提交发布：把私有片段送审（none / rejected → pending）。
   *
   * 提交后 `isPublic` **仍为 false** —— 内容要等管理员通过才真正进入公共库。
   * 语义闸门（标题 / 描述规范）已在创建与更新时拦截，此处不重复校验。
   */
  async submitSnippetForPublication(userId: string, id: string) {
    const snippet = await this.ensureSnippetOwned(userId, id)

    if (snippet.isPublic) {
      throw new BadRequestException('该片段已在公共代码块库中。')
    }
    if (snippet.moderationStatus === 'pending') {
      throw new BadRequestException('该片段正在审核中，请耐心等待。')
    }

    await this.snippetRepo.update(
      { id },
      // 重新提交时清空上一次的审核结论，避免作者看到过期的拒绝理由
      { moderationStatus: 'pending', moderationNote: null, moderatedAt: null } as never,
    )

    return this.getSnippet(userId, id)
  }

  /**
   * 取消发布：撤回待审（pending）或下架已发布（approved），一律回到私有。
   *
   * 两种场景的终态相同（isPublic = false、moderationStatus = none），
   * 作者视角都是「不公开了」，故合并为一个动作。
   */
  async withdrawSnippetPublication(userId: string, id: string) {
    const snippet = await this.ensureSnippetOwned(userId, id)

    if (!snippet.isPublic && snippet.moderationStatus !== 'pending') {
      throw new BadRequestException('该片段当前不在发布流程中。')
    }

    await this.snippetRepo.update(
      { id },
      {
        isPublic: false,
        moderationStatus: 'none',
        moderationNote: null,
        moderatedAt: null,
      } as never,
    )

    return this.getSnippet(userId, id)
  }

  /**
   * 审核队列（管理员）。
   *
   * ⚠️ 这里**故意不按 userId 过滤** —— 管理员要看的是「所有用户提交的内容」。
   * 访问控制由控制器层的 `RolesGuard` + `@Roles('admin')` 保证，
   * 本方法假定调用方已是管理员（service 层不做角色判断，避免权限逻辑两处漂移）。
   */
  async listModerationQueue(query: ListModerationQueueDto = {}) {
    const page = clampPage(query.page)
    const pageSize = clampPageSize(query.pageSize)
    const status = query.status ?? 'pending'

    const [items, total] = await this.snippetRepo.findAndCount({
      where: { moderationStatus: status },
      relations: ['collection', 'tagLinks', 'tagLinks.tag', 'user'],
      // 按提交时间排队：提交 / 编辑都会刷新 updatedAt，比 moderatedAt（首次为 null）可靠
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return {
      items: items.map(item => ({
        ...this.mapSnippet(item),
        // 审核要判断「谁提交的」，列表条目带上作者标识
        authorName: item.user?.displayName ?? item.user?.username ?? null,
        authorUsername: item.user?.username ?? null,
      })),
      total,
      page,
      pageSize,
    }
  }

  /**
   * 审核动作（管理员）：approve → 进公共库；reject → 保持私有并记录原因。
   *
   * 只接受处于 `pending` 的片段，避免对同一条内容重复裁决（并发点击 / 过期页面）。
   */
  async moderateSnippet(userId: string, id: string, payload: ModerateSnippetDto) {
    const snippet = await this.snippetRepo.findOne({ where: { id } })
    if (!snippet) {
      throw new NotFoundException('代码片段不存在。')
    }
    if (snippet.moderationStatus !== 'pending') {
      throw new BadRequestException('该片段不在待审核状态，可能已被处理。')
    }

    const approve = payload.action === 'approve'
    await this.snippetRepo.update(
      { id },
      {
        isPublic: approve,
        moderationStatus: approve ? 'approved' : 'rejected',
        moderationNote: payload.note?.trim() || null,
        moderatedAt: new Date(),
      } as never,
    )

    // 不能复用 getSnippet(userId, id)：拒绝后片段仍归**作者**，
    // 而这里的 userId 是审核的管理员 —— assertSnippetAccessible 会抛 404。
    const updated = await this.snippetRepo.findOne({
      where: { id },
      relations: ['collection', 'tagLinks', 'tagLinks.tag'],
    })

    return updated ? this.mapSnippet(updated) : null
  }

  async recordUse(userId: string | null, id: string) {
    const snippet = await this.snippetRepo.findOne({ where: { id } })

    if (!snippet) {
      throw new NotFoundException('代码片段不存在。')
    }

    // 公共片段同样允许记录使用（驱动全局「最近使用」排序）
    this.assertSnippetAccessible(snippet, userId)

    await this.snippetRepo.update(
      { id },
      {
        usageCount: () => '"usage_count" + 1',
        lastUsedAt: new Date(),
      },
    )

    return {
      id: snippet.id,
      usageCount: snippet.usageCount + 1,
      lastUsedAt: new Date().toISOString(),
    }
  }

  /**
   * 将公共片段复制到当前用户的个人片段库。
   * 源片段必须为公共片段；目标集合必须为用户个人集合（或为空）。
   * 复制产物为全新的私有片段（isPublic = false，favorite = false）。
   */
  async copySnippet(userId: string, sourceId: string, targetCollectionId: string | null) {
    const source = await this.snippetRepo.findOne({ where: { id: sourceId } })

    if (!source) {
      throw new NotFoundException('代码片段不存在。')
    }

    if (!source.isPublic) {
      throw new BadRequestException('仅支持复制公共代码片段。')
    }

    const collection = await this.ensureCollectionOwned(userId, targetCollectionId)

    const created = await this.snippetRepo.save(
      this.snippetRepo.create({
        id: generateId(),
        userId,
        collectionId: collection?.id ?? null,
        name: source.name,
        description: source.description,
        language: source.language,
        content: source.content,
        displayAttrs: source.displayAttrs,
        placeholderDefs: source.placeholderDefs,
        favorite: false,
        isPublic: false,
      }),
    )

    return this.getSnippet(userId, created.id)
  }

  // ── 版本历史 ──

  async listSnippetVersions(userId: string, snippetId: string, page = 1, pageSize = 30) {
    await this.ensureSnippetOwned(userId, snippetId)
    return this.snippetVersionService.listVersions(snippetId, page, pageSize)
  }

  async getSnippetVersion(userId: string, snippetId: string, versionId: string) {
    await this.ensureSnippetOwned(userId, snippetId)
    return this.snippetVersionService.getVersion(snippetId, versionId)
  }

  async deleteSnippetVersion(userId: string, snippetId: string, versionId: string) {
    await this.ensureSnippetOwned(userId, snippetId)
    return this.snippetVersionService.deleteVersion(snippetId, versionId)
  }

  async rollbackSnippetVersion(userId: string, snippetId: string, versionId: string) {
    await this.ensureSnippetOwned(userId, snippetId)
    return this.snippetVersionService.rollback(userId, snippetId, versionId)
  }

  // ── 批量操作（8/30 页面契约：批量打标 / 批量删除） ──

  /** 批量为片段添加标签（跳过不存在或无权操作的 id）。 */
  async batchAddTag(userId: string, ids: string[], tag: string) {
    const snippets = await this.snippetRepo.find({ where: { id: In(ids) } })
    const owned = snippets.filter((item) => item.userId === userId)
    for (const snippet of owned) {
      // batch 语义是「追加」而非整体重设：先读现有标签再合并去重，避免清空旧标签
      const existing = await this.snippetTagNames(snippet.id)
      const merged = [...new Set([...existing, tag])]
      if (merged.length === existing.length) continue
      await this.dataSource.transaction((manager) => this.syncSnippetTags(manager, userId, snippet.id, merged))
    }
    const ownedIds = new Set(owned.map((item) => item.id))
    return { updated: owned.length, missing: ids.filter((id) => !ownedIds.has(id)) }
  }

  /** 批量删除片段（不存在或无权操作的 id 自动跳过）。 */
  async batchDelete(userId: string, ids: string[]) {
    const snippets = await this.snippetRepo.find({ where: { id: In(ids) } })
    const owned = snippets.filter((item) => item.userId === userId)
    await this.snippetRepo.remove(owned)
    const ownedIds = new Set(owned.map((item) => item.id))
    return { deleted: owned.length, missing: ids.filter((id) => !ownedIds.has(id)) }
  }

  private async snippetTagNames(snippetId: string): Promise<string[]> {
    const links = await this.tagLinkRepo.find({ where: { snippetId }, relations: ['tag'] })
    return links.map((link) => link.tag.name)
  }
}
