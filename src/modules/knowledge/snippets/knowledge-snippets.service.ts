import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import { generateId } from '../../../common/utils/id.util'
import { clampPage, clampPageSize } from '../../../common/utils/pagination.util'
import { KnowledgeSnippet } from '../entities/knowledge-snippet.entity'
import { KnowledgeSnippetTag } from '../entities/knowledge-snippet-tag.entity'
import { KnowledgeSnippetTagLink } from '../entities/knowledge-snippet-tag-link.entity'
import { SnippetCollection } from '../entities/snippet-collection.entity'
import { SnippetVersionService } from './snippet-version.service'
import {
 CreateKnowledgeSnippetDto,
 CreateSnippetCollectionDto,
 ListKnowledgeSnippetsDto,
 UpdateKnowledgeSnippetDto,
 UpdateSnippetCollectionDto,
} from './dto/knowledge-snippet.dto'
import { normalizeSnippetDisplayAttrs, snippetDisplayDefaults } from './snippet-display.util'
import { extractSnippetPlaceholderDefs } from './snippet-placeholder.util'
import type { SnippetDisplayAttrs, SnippetPlaceholderDef } from './snippet-types'

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

const normalizePlaceholderDefs = (content: string, language: string) => {
 try {
   return extractSnippetPlaceholderDefs(content, language)
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
   private readonly snippetVersionService: SnippetVersionService
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
   }>
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
       .map((node) => ({
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
   collectionId: string | null | undefined
 ) {
   if (!collectionId) {
     return null
   

  /** 批量为片段添加标签（跳过不存在或无权操作的 id）。 */
  async batchAddTag(ids: string[], tag: string) {
    const existing = await this.snippetRepo.find({ where: { id: In(ids) } });
    for (const snippet of existing) {
      const tags: string[] = Array.isArray((snippet as any).tags) ? (snippet as any).tags : [];
      if (!tags.includes(tag)) {
        tags.push(tag);
        (snippet as any).tags = tags;
        await this.snippetRepo.save(snippet);
      }
    }
    const foundIds = new Set(existing.map((item) => item.id));
    return { updated: existing.length, missing: ids.filter((id) => !foundIds.has(id)) };
  }

  /** 批量删除片段（不存在或无权操作的 id 自动跳过）。 */
  async batchDelete(ids: string[]) {
    const existing = await this.snippetRepo.find({ where: { id: In(ids) } });
    await this.snippetRepo.remove(existing);
    const foundIds = new Set(existing.map((item) => item.id));
    return { deleted: existing.length, missing: ids.filter((id) => !foundIds.has(id)) };
  }
}