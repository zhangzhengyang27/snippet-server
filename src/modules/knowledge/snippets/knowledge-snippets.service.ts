import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
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
} from './dto/knowledge-snippet.dto'
import {
  normalizeSnippetDisplayAttrs,
  snippetDisplayDefaults,
} from './snippet-display.util'
import { extractSnippetPlaceholderDefs } from './snippet-placeholder.util'
import { SnippetVersionService } from './snippet-version.service'
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

  private mapSnippet(item: KnowledgeSnippet) {
    const displayAttrs = normalizeSnippetDisplayAttrs(
      (item.displayAttrs as Record<string, unknown> | null | undefined) ?? undefined,
    )
    const placeholderDefs = Array.isArray(item.placeholderDefs)
      ? (item.placeholderDefs as unknown as SnippetPlaceholderDef[])
      : []

    const tagLinks = [...(item.tagLinks ?? [])].sort((left, right) =>
      (left.tag?.name ?? '').localeCompare(right.tag?.name ?? ''),
    )

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      language: item.language,
      content: item.content,
      isPublic: item.isPublic,
      displayAttrs,
      placeholderDefs,
      favorite: item.favorite,
      usageCount: item.usageCount,
      lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      collectionId: item.collectionId ?? item.collection?.id ?? null,
      collectionName: item.collection?.name ?? null,
      tags: tagLinks.map(link => link.tag?.name).filter(Boolean) as string[],
    }
  }

  async listCollectionsTree(userId: string | null) {
    // 登录用户看到「个人集合 + 公共集合」，未登录用户仅看到公共集合
    const where = userId ? [{ userId }, { isPublic: true }] : [{ isPublic: true }]
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

  async reorderCollections(userId: string, items: ReorderCollectionInput[]) {
    if (!Array.isArray(items) || items.length === 0) {
      return this.listCollectionsTree(userId)
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

    return this.listCollectionsTree(userId)
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

    // 登录用户看到「个人片段 + 公共片段」混合分页列表，未登录用户仅看到公共片段
    if (userId) {
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

    if (typeof query.favorite === 'boolean') {
      qb.andWhere('snippet.favorite = :favorite', { favorite: query.favorite })
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

    qb.orderBy('snippet.favorite', 'DESC')

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

    return {
      items: items.map(item => this.mapSnippet(item)),
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

    return this.mapSnippet(item)
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

    await this.dataSource.transaction(async manager => {
      const snippetRepository = manager.getRepository(KnowledgeSnippet)

      await snippetRepository.update(
        { id },
        {
          name: payload.name ?? current.name,
          description:
            payload.description !== undefined
              ? normalizeDescription(payload.description)
              : current.description,
          language,
          collectionId: nextCollectionId,
          content,
          displayAttrs,
          placeholderDefs,
          favorite,
        } as never,
      )

      if (tagNames !== undefined) {
        await this.syncSnippetTags(manager, userId, id, tagNames)
      }
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

  // ── 版本历史（8/30 前端契约：委托 SnippetVersionService，当前返回空集） ──

  async listSnippetVersions(userId: string, snippetId: string, page = 1, pageSize = 30) {
    await this.ensureSnippetOwned(userId, snippetId)
    return this.snippetVersionService.listVersions(snippetId)
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
    return this.snippetVersionService.rollback(snippetId, versionId)
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
