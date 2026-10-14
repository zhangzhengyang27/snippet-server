/**
 * 公共片段标签回填
 *
 * ## 背景
 * 标签功能（表 `ui_knowledge_snippet_tags` / `ui_knowledge_snippet_tag_links`、
 * 服务端 `syncSnippetTags`、前端标签面板与筛选、`POST /knowledge/snippets/batch/tag`）
 * 前后端完整可用，但两张表一直是 **0 行** —— 因为历史上唯一的批量导入脚本
 * `scripts/import-public-snippets.ts` 只把标签实体注册进 DataSource，从未写入过标签，
 * 而它依赖的源 JSON（`data/snippets-*.json`）也已不在仓库里。
 *
 * 结果：公共库 3,414 条片段没有任何标签，标签筛选面板永远空白。
 *
 * ## 做法：从既有数据派生，不引入外部数据源
 * 每条公共片段生成 1–2 个标签：
 *   1. **语言标签** —— 取片段自身的 `language`（javascript / python / html / …）；
 *   2. **技术域标签** —— 取片段所属集合向上追溯到**顶层集合**的名字
 *      （前端 / 数据库 / 移动开发 / DevOps / Java / Python / Shell）。
 *      但只要技术域名与**数据集中存在的任何一个语言标签**仅大小写不同
 *      （Java↔java、Python↔python），就**整体丢弃该技术域标签** ——
 *      否则标签面板里会同时出现 `python` 与 `Python`、`java` 与 `Java`，
 *      既像重复又容易误选。技术域与语言重名时，语言标签已足够表达该维度。
 *
 * 标签归属：公共片段的托管账号（`resolvePublicOwner`，即 admin）。
 * 标签表对 `user_id` 有 NOT NULL 约束，且唯一索引建在 `(user_id, name)` 上。
 *
 * ## 幂等
 * 两处写入都走 `ON CONFLICT DO NOTHING`：
 * - 标签按 `(user_id, name)` 去重；
 * - 关联按主键 `(snippet_id, tag_id)` 去重。
 * 重复执行不会产生重复数据，也**不会删除**已有关联（纯追加）。
 *
 * ## 运行
 * ```
 * cd snippet-server
 * npx ts-node --transpile-only -P tsconfig.json scripts/backfill-snippet-tags.ts            # 预演
 * npx ts-node --transpile-only -P tsconfig.json scripts/backfill-snippet-tags.ts --apply    # 落库
 * ```
 * ⚠️ 必须用 ts-node，不能用 tsx —— 实体依赖 `emitDecoratorMetadata`，esbuild 不支持。
 *
 * ## 回滚
 * 本次只新增行，回滚即清空两张表（标签表此前为空）：
 * ```sql
 * DELETE FROM ui_knowledge_snippet_tag_links;
 * DELETE FROM ui_knowledge_snippet_tags;
 * ```
 */
import 'dotenv/config'
import { DataSource } from 'typeorm'
import { nanoid } from 'nanoid'
import { User } from '../src/modules/auth/entities/user.entity'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippetTag } from '../src/modules/knowledge/entities/knowledge-snippet-tag.entity'
import { KnowledgeSnippetTagLink } from '../src/modules/knowledge/entities/knowledge-snippet-tag-link.entity'
import { resolvePublicOwner } from './public-owner'

const APPLY = process.argv.includes('--apply')

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'html5_examples',
  entities: [
    User,
    KnowledgeSnippet,
    SnippetCollection,
    KnowledgeSnippetTag,
    KnowledgeSnippetTagLink,
  ],
  synchronize: false,
})

/** 从集合向上走到顶层，返回顶层集合名；集合为空时返回 null。 */
function resolveTopLevelName(
  collectionId: string | null,
  byId: Map<string, { name: string; parentId: string | null }>,
): string | null {
  let currentId = collectionId
  let guard = 0
  let last: string | null = null

  while (currentId && guard < 32) {
    guard += 1
    const node = byId.get(currentId)
    if (!node) break
    last = node.name
    if (!node.parentId) break
    currentId = node.parentId
  }

  return last
}

async function main() {
  await dataSource.initialize()

  try {
    const owner = await resolvePublicOwner(dataSource)
    console.log(`托管账号: ${owner.username} (${owner.id})`)

    const snippetRepo = dataSource.getRepository(KnowledgeSnippet)
    const collectionRepo = dataSource.getRepository(SnippetCollection)

    const snippets = await snippetRepo.find({
      where: { isPublic: true },
      select: ['id', 'language', 'collectionId'],
    })
    const collections = await collectionRepo.find({
      select: ['id', 'name', 'parentId'],
    })

    const byId = new Map(
      collections.map(c => [c.id, { name: c.name, parentId: c.parentId ?? null }]),
    )

    console.log(`公共片段: ${snippets.length} 条 / 集合: ${collections.length} 个`)

    // 数据集中出现的全部语言标签：与技术域重名（忽略大小写）的技术域会被整体丢弃，
    // 见文件头「技术域标签」一节。
    const languageTags = new Set(
      snippets
        .map(snippet => (snippet.language ?? '').trim().toLowerCase())
        .filter(Boolean),
    )

    // snippet → 标签名集合
    const plan: Array<{ snippetId: string; tagNames: string[] }> = []
    const tagCount = new Map<string, number>()

    for (const snippet of snippets) {
      const names: string[] = []

      const language = (snippet.language ?? '').trim().toLowerCase()
      if (language) names.push(language)

      const domain = resolveTopLevelName(snippet.collectionId ?? null, byId)
      if (domain && !languageTags.has(domain.toLowerCase())) names.push(domain)

      const unique = [...new Set(names)]
      plan.push({ snippetId: snippet.id, tagNames: unique })

      for (const name of unique) {
        tagCount.set(name, (tagCount.get(name) ?? 0) + 1)
      }
    }

    const sortedTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1])
    const totalLinks = plan.reduce((sum, item) => sum + item.tagNames.length, 0)

    console.log(`\n将生成标签 ${sortedTags.length} 个，关联 ${totalLinks} 条：`)
    for (const [name, count] of sortedTags) {
      console.log(`  ${String(count).padStart(5)}  ${name}`)
    }

    console.log('\n样例（前 5 条）：')
    for (const item of plan.slice(0, 5)) {
      console.log(`  ${item.snippetId}  →  ${item.tagNames.join(', ') || '(无)'}`)
    }

    if (!APPLY) {
      console.log('\n[预演] 未写入任何数据。加 --apply 落库。')
      return
    }

    // ── 写入 ──
    const tagRows = sortedTags.map(([name]) => ({
      id: nanoid(12),
      userId: owner.id,
      name,
    }))

    await dataSource
      .createQueryBuilder()
      .insert()
      .into(KnowledgeSnippetTag)
      .values(tagRows)
      .orIgnore()
      .execute()

    const tagEntities = await dataSource.getRepository(KnowledgeSnippetTag).find({
      where: { userId: owner.id },
    })
    const tagIdByName = new Map(tagEntities.map(t => [t.name, t.id]))

    const missing = sortedTags.filter(([name]) => !tagIdByName.has(name))
    if (missing.length > 0) {
      throw new Error(`以下标签写入后仍未找到：${missing.map(([n]) => n).join(', ')}`)
    }

    const linkRows = plan.flatMap(item =>
      item.tagNames.map(name => ({
        snippetId: item.snippetId,
        tagId: tagIdByName.get(name) as string,
        assignedAt: new Date(),
      })),
    )

    // ⚠️ 不能用 insert 返回的 identifiers 统计「新增了多少」：
    // `.orIgnore()`（ON CONFLICT DO NOTHING）下，被忽略的重复行**同样**会出现在
    // identifiers 里，幂等复跑会误报成「新增 5468 条」。改按插入前后的总数差计算。
    const linksBefore = await dataSource.getRepository(KnowledgeSnippetTagLink).count()

    // 分批插入，避免单条 SQL 参数过多
    const BATCH = 500
    for (let i = 0; i < linkRows.length; i += BATCH) {
      const chunk = linkRows.slice(i, i + BATCH)
      await dataSource
        .createQueryBuilder()
        .insert()
        .into(KnowledgeSnippetTagLink)
        .values(chunk)
        .orIgnore()
        .execute()
    }

    const linksAfter = await dataSource.getRepository(KnowledgeSnippetTagLink).count()
    const inserted = linksAfter - linksBefore

    const finalTags = await dataSource
      .getRepository(KnowledgeSnippetTag)
      .count({ where: { userId: owner.id } })
    const finalLinks = await dataSource.getRepository(KnowledgeSnippetTagLink).count()

    console.log('\n✅ 完成')
    console.log(`  标签总数: ${finalTags}`)
    console.log(`  关联总数: ${finalLinks}`)
    console.log(`  本次新增关联(去重后有效): ${inserted}`)
  } finally {
    await dataSource.destroy()
  }
}

main().catch(error => {
  console.error('\n❌ 执行失败:', error)
  process.exitCode = 1
})
