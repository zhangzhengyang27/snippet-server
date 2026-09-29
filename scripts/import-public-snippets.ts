/**
 * 公共代码片段导入脚本
 *
 * 将项目根 data/ 目录下全部 snippets-*.json 文件中的代码片段导入数据库，
 * 作为「公共片段」（is_public = true，user_id 为 NULL）：
 * - 未登录用户即可只读浏览、搜索、复制代码；
 * - 登录用户可「复制到我的集合」，但不能编辑/删除/收藏公共片段。
 *
 * 组织方式：每个 JSON 文件对应一个公共集合（如「前端」「后端」），
 * 文件内每个 snippet 的 subcategory 字段决定其归属的子集合。
 *
 * 幂等性：
 * - 根集合按「name + isPublic + userId 为 NULL + parentId 为 NULL」去重；
 * - 子集合按「name + parentId + isPublic + userId 为 NULL」去重；
 * - 片段按「collectionId + name + isPublic」去重。
 * 重复执行脚本不会产生重复数据。
 *
 * 运行：cd server && npx ts-node --transpile-only -P tsconfig.json scripts/import-public-snippets.ts
 * （必须用 ts-node 而非 tsx：实体依赖 emitDecoratorMetadata，tsx/esbuild 不支持）
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataSource, IsNull, Not } from 'typeorm'
import { nanoid } from 'nanoid'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippetTag } from '../src/modules/knowledge/entities/knowledge-snippet-tag.entity'
import { KnowledgeSnippetTagLink } from '../src/modules/knowledge/entities/knowledge-snippet-tag-link.entity'
import { User } from '../src/modules/auth/entities/user.entity'

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'html5_examples',
  entities: [KnowledgeSnippet, SnippetCollection, KnowledgeSnippetTag, KnowledgeSnippetTagLink, User],
  synchronize: false,
})

/** 生成 12 字符短 ID（与服务端 generateId 保持一致） */
const generateId = () => nanoid(12)

/** JSON 源文件（位于项目根 data/ 目录）→ 公共集合中文名称 */
const SOURCE_FILES: Array<{ file: string; name: string }> = [
  { file: 'snippets-frontend.json', name: '前端' },
  { file: 'snippets-backend.json', name: '后端' },
  { file: 'snippets-database.json', name: '数据库' },
  { file: 'snippets-devops.json', name: 'DevOps' },
  { file: 'snippets-java.json', name: 'Java' },
  { file: 'snippets-mobile.json', name: '移动开发' },
  { file: 'snippets-python.json', name: 'Python' },
  { file: 'snippets-shell.json', name: 'Shell' },
  { file: 'snippets-frontend-advanced.json', name: '前端' },
  { file: 'snippets-java-advanced.json', name: 'Java' },
  { file: 'snippets-python-advanced.json', name: 'Python' },
  // 第二批
  { file: 'snippets-frontend-2.json', name: '前端' },
  { file: 'snippets-backend-2.json', name: '后端' },
  { file: 'snippets-database-2.json', name: '数据库' },
  { file: 'snippets-devops-2.json', name: 'DevOps' },
  { file: 'snippets-java-2.json', name: 'Java' },
  { file: 'snippets-python-2.json', name: 'Python' },
  { file: 'snippets-shell-2.json', name: 'Shell' },
  { file: 'snippets-mobile-2.json', name: '移动开发' },
  // 第三批
  { file: 'snippets-frontend-3.json', name: '前端' },
  { file: 'snippets-backend-3.json', name: '后端' },
  { file: 'snippets-database-3.json', name: '数据库' },
  { file: 'snippets-devops-3.json', name: 'DevOps' },
  { file: 'snippets-java-3.json', name: 'Java' },
  { file: 'snippets-python-3.json', name: 'Python' },
  { file: 'snippets-shell-3.json', name: 'Shell' },
  { file: 'snippets-mobile-3.json', name: '移动开发' },
  // 第四批
  { file: 'snippets-frontend-4.json', name: '前端' },
  { file: 'snippets-backend-4.json', name: '后端' },
  { file: 'snippets-database-4.json', name: '数据库' },
  { file: 'snippets-devops-4.json', name: 'DevOps' },
  { file: 'snippets-java-4.json', name: 'Java' },
  { file: 'snippets-python-4.json', name: 'Python' },
  { file: 'snippets-shell-4.json', name: 'Shell' },
  { file: 'snippets-mobile-4.json', name: '移动开发' },
]

/** JSON 文件中单个片段的结构 */
interface SourceSnippet {
  name: string
  language: string
  code: string
  description?: string
  subcategory?: string
}

/** JSON 文件的顶层结构 */
interface SourceFile {
  category: string
  description?: string
  count?: number
  snippets: SourceSnippet[]
}

/** 公共集合排序起点：避开个人集合（个人集合 order 从 0 递增），排在其后 */
const PUBLIC_COLLECTION_ORDER_BASE = 1000

async function main() {
  await dataSource.initialize()
  const collectionRepo = dataSource.getRepository(SnippetCollection)
  const snippetRepo = dataSource.getRepository(KnowledgeSnippet)

  // 代码片段 JSON 源文件所在目录（脚本位于 server/scripts/ 下，数据源位于项目根 data/ 目录）
  const rootDir = resolve(__dirname, '..', '..', 'data')

  let rootCollectionsCreated = 0
  let subCollectionsCreated = 0
  let snippetsInserted = 0
  let snippetsSkipped = 0

  // 缓存每个根集合下已创建的子集合，减少数据库查询
  const subCollectionCache = new Map<string, SnippetCollection>()

  // ─── 清理旧公共数据 ───
  // 本次导入会按新的 subcategory 重新组织片段，因此先清空旧的公共片段和子集合。
  // 根集合保留（用户可能已对其排序或展开），只重置其内容。
  console.log('清理旧公共片段和子集合...')
  const deletedSnippets = await snippetRepo.delete({ isPublic: true })
  const deletedSubCollections = await collectionRepo.delete({
    isPublic: true,
    userId: IsNull(),
    parentId: Not(IsNull()),
  })
  console.log(
    `  已删除公共片段 ${deletedSnippets.affected ?? 0} 条，公共子集合 ${deletedSubCollections.affected ?? 0} 个`,
  )

  // 清理不再需要的孤立公共根集合（名称不在 SOURCE_FILES 中的）
  const validNames = new Set(SOURCE_FILES.map((s) => s.name))
  const orphanRoots = await collectionRepo.find({
    where: { isPublic: true, userId: IsNull(), parentId: IsNull() },
  })
  for (const root of orphanRoots) {
    if (!validNames.has(root.name)) {
      await collectionRepo.delete(root.id)
      console.log(`  已删除孤立公共根集合「${root.name}」(${root.id})`)
    }
  }

  for (const [index, source] of SOURCE_FILES.entries()) {
    const filePath = resolve(rootDir, source.file)
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as SourceFile

    if (!Array.isArray(data.snippets)) {
      console.warn(`跳过 ${source.file}：缺少 snippets 数组`)
      continue
    }

    // ─── 1. 创建/复用公共根集合 ───
    let rootCollection = await collectionRepo.findOne({
      where: { name: source.name, isPublic: true, userId: IsNull(), parentId: IsNull() },
    })
    if (!rootCollection) {
      rootCollection = await collectionRepo.save(
        collectionRepo.create({
          id: generateId(),
          userId: null,
          parentId: null,
          isPublic: true,
          name: source.name,
          order: PUBLIC_COLLECTION_ORDER_BASE + index,
        }),
      )
      rootCollectionsCreated++
      console.log(`创建公共根集合「${source.name}」(${rootCollection.id})`)
    } else {
      console.log(`公共根集合「${source.name}」已存在，复用 (${rootCollection.id})`)
    }

    // 预加载该根集合下已有的子集合到缓存
    const existingSubCollections = await collectionRepo.find({
      where: { parentId: rootCollection.id, isPublic: true, userId: IsNull() },
    })
    for (const sub of existingSubCollections) {
      subCollectionCache.set(`${rootCollection.id}:${sub.name}`, sub)
    }

    // ─── 2. 按 subcategory 分组 ───
    const grouped = new Map<string, SourceSnippet[]>()
    const fallbackKey = '其他'
    for (const item of data.snippets) {
      const key = item.subcategory?.trim() || fallbackKey
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(item)
    }

    // ─── 3. 导入片段 ───
    let subOrder = 0
    for (const [subcategory, items] of grouped.entries()) {
      const targetCollection = await ensureSubCollection(
        collectionRepo,
        rootCollection,
        subcategory,
        subOrder,
        subCollectionCache,
      )
      subOrder++

      for (const item of items) {
        if (!item?.name || typeof item.code !== 'string') {
          snippetsSkipped++
          continue
        }

        const exists = await snippetRepo.findOne({
          where: { collectionId: targetCollection.id, name: item.name, isPublic: true },
        })
        if (exists) {
          snippetsSkipped++
          continue
        }

        await snippetRepo.save(
          snippetRepo.create({
            id: generateId(),
            userId: null,
            collectionId: targetCollection.id,
            isPublic: true,
            name: item.name,
            description: item.description ?? null,
            language: item.language || 'text',
            content: item.code,
            displayAttrs: {},
            placeholderDefs: [],
            favorite: false,
            usageCount: 0,
          }),
        )
        snippetsInserted++
      }
    }

    console.log(`  ${source.file}：${data.snippets.length} 个片段处理完毕`)
  }

  console.log(
    `\n导入完成：新建根集合 ${rootCollectionsCreated} 个，新建子集合 ${subCollectionsCreated} 个，新增片段 ${snippetsInserted} 条，跳过 ${snippetsSkipped} 条`,
  )
  await dataSource.destroy()

  /** 创建或复用子集合 */
  async function ensureSubCollection(
    repo: typeof collectionRepo,
    root: SnippetCollection,
    name: string,
    order: number,
    cache: Map<string, SnippetCollection>,
  ): Promise<SnippetCollection> {
    const cacheKey = `${root.id}:${name}`
    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    let sub = await repo.findOne({
      where: { name, parentId: root.id, isPublic: true, userId: IsNull() },
    })
    if (!sub) {
      sub = await repo.save(
        repo.create({
          id: generateId(),
          userId: null,
          parentId: root.id,
          isPublic: true,
          name,
          order,
        }),
      )
      subCollectionsCreated++
    }

    cache.set(cacheKey, sub)
    return sub
  }
}

main().catch((err) => {
  console.error('导入失败:', err)
  process.exit(1)
})
