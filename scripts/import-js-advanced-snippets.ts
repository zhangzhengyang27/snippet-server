/**
 * 将 js-advanced-road/project-data.json 的代码块增量并入「前端」公共根集合。
 *
 * 与 import-public-snippets.ts 的区别：
 * - 不触发「清空所有公共片段/子集合」逻辑，纯增量并入，避免覆盖 data/ 已导入的数据；
 * - 去重规则：
 *   1) content 为空或长度 < 10 → 视为无效/低质量，跳过；
 *   2) 与「前端」根集合下已有（任意子集合）片段 content 完全一致 → 视为「已存在」，跳过；
 *   3) 与本次批次内已处理 content 重复 → 跳过；
 *   4) 同一子集合下 name 已存在 → 跳过。
 *
 * 组织方式：标题按「 - 」拆分级，首段作为子集合名，剩余段作为片段名；
 * 仅单段时归入兜底子集合「JS 进阶之路」。
 *
 * 运行：cd server && npx ts-node --transpile-only -P tsconfig.json scripts/import-js-advanced-snippets.ts
 * （必须用 ts-node 而非 tsx：实体依赖 emitDecoratorMetadata，tsx/esbuild 不支持）
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataSource, IsNull } from 'typeorm'
import { nanoid } from 'nanoid'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippetTag } from '../src/modules/knowledge/entities/knowledge-snippet-tag.entity'
import { KnowledgeSnippetTagLink } from '../src/modules/knowledge/entities/knowledge-snippet-tag-link.entity'
import { User } from '../src/modules/auth/entities/user.entity'
import { resolvePublicOwner } from './public-owner'
import {
  checkSnippetMetadata,
  formatIssues,
} from '../src/modules/knowledge/snippets/snippet-metadata.util'

const SOURCE_PATH =
  '/Users/xiaoye/Desktop/待处理的项目/js-advanced-road/project-data.json'
const ROOT_COLLECTION_NAME = '前端'
const FALLBACK_SUB = 'JS 进阶之路'
const MIN_CONTENT_LEN = 10

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'html5_examples',
  entities: [
    KnowledgeSnippet,
    SnippetCollection,
    KnowledgeSnippetTag,
    KnowledgeSnippetTagLink,
    User,
  ],
  synchronize: false,
})

/** 生成 12 字符短 ID（与服务端 generateId 保持一致） */
const generateId = () => nanoid(12)

/** 推断语言：明确的 HTML 文档标记判为 html，其余（JS 进阶来源）判为 javascript */
function inferLanguage(code: string): string {
  const c = code.trim()
  if (/<!DOCTYPE|<html|<body|<head|<\/html>|<\/body>|<\/head>/.test(c)) {
    return 'html'
  }
  return 'javascript'
}

/** 解析标题分级：首段→子集合，剩余→片段名；单段归入兜底子集合 */
function parseTitle(title: string): { subcategory: string; name: string } {
  const parts = (title || '')
    .split(' - ')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) {
    return { subcategory: FALLBACK_SUB, name: parts[0] || '未命名片段' }
  }
  return { subcategory: parts[0], name: parts.slice(1).join(' - ') }
}

interface SourceItem {
  title?: string
  description?: string
  content?: string
}

async function main() {
  await dataSource.initialize()
  const collectionRepo = dataSource.getRepository(SnippetCollection)
  const snippetRepo = dataSource.getRepository(KnowledgeSnippet)

  // 公共片段统一挂在托管账号下，不再写 NULL 归属
  const publicOwner = await resolvePublicOwner(dataSource)
  console.log(`公共片段托管账号：${publicOwner.username} (${publicOwner.id})`)

  // ─── 复用「前端」公共根集合 ───
  let root = await collectionRepo.findOne({
    where: {
      name: ROOT_COLLECTION_NAME,
      isPublic: true,
      userId: IsNull(),
      parentId: IsNull(),
    },
  })
  if (!root) {
    root = await collectionRepo.save(
      collectionRepo.create({
        id: generateId(),
        userId: null,
        parentId: null,
        isPublic: true,
        name: ROOT_COLLECTION_NAME,
        order: 1000,
      }),
    )
    console.log(`创建前端根集合 (${root.id})`)
  } else {
    console.log(`复用前端根集合 (${root.id})`)
  }

  // ─── 构建去重集合：前端根集合下现有片段 content（跨子集合防重复）───
  const existingContent = new Set<string>()
  const allSub = await collectionRepo.find({
    where: { parentId: root.id, isPublic: true, userId: IsNull() },
  })
  const subMap = new Map<string, SnippetCollection>()
  for (const s of allSub) subMap.set(s.name, s)
  for (const s of allSub) {
    const snips = await snippetRepo.find({
      where: { collectionId: s.id, isPublic: true },
      select: ['content'],
    })
    for (const sn of snips) existingContent.add(sn.content || '')
  }
  console.log(
    `前端根集合现有子集合 ${allSub.length} 个，已纳入去重库的片段 content ${existingContent.size} 条`,
  )

  // ─── 读取源 ───
  const raw = readFileSync(SOURCE_PATH, 'utf-8')
  const items = JSON.parse(raw) as SourceItem[]
  console.log(`源文件共 ${items.length} 条`)

  let inserted = 0
  let skippedEmpty = 0
  let skippedDup = 0
  let skippedName = 0
  /** 语义闸门拦下的（标题/描述不达标），与上面「内容重复」分开统计 */
  let skippedInvalid = 0
  const invalidReasons: string[] = []
  const batchContent = new Set<string>()
  let subOrder = allSub.length

  for (const item of items) {
    const content = (item.content || '').trim()
    // 1) 低质量/无效：空或极短
    if (!content || content.length < MIN_CONTENT_LEN) {
      skippedEmpty++
      continue
    }
    // 2) 与已有（跨子集合）或本批次重复
    if (existingContent.has(content) || batchContent.has(content)) {
      skippedDup++
      continue
    }
    batchContent.add(content)

    const { subcategory, name } = parseTitle(item.title || '')
    const finalName =
      name || (subcategory === FALLBACK_SUB ? content.slice(0, 40) : subcategory)

    // 子集合：复用或新建
    let sub = subMap.get(subcategory)
    if (!sub) {
      sub = await collectionRepo.save(
        collectionRepo.create({
          id: generateId(),
          userId: null,
          parentId: root.id,
          isPublic: true,
          name: subcategory,
          order: subOrder++,
        }),
      )
      subMap.set(subcategory, sub)
    }

    // 4) 同子集合同名去重
    const existsName = await snippetRepo.findOne({
      where: { collectionId: sub.id, name: finalName, isPublic: true },
    })
    if (existsName) {
      skippedName++
      continue
    }

    // 语义闸门：标题/描述不达标的片段不写库（历史病灶：description 缺失导致空壳描述回库）
    const issues = checkSnippetMetadata({ name: finalName, description: item.description ?? null })
    if (issues.length > 0) {
      skippedInvalid++
      invalidReasons.push(`${finalName} → ${formatIssues(issues)}`)
      continue
    }

    await snippetRepo.save(
      snippetRepo.create({
        id: generateId(),
        userId: publicOwner.id,
        collectionId: sub.id,
        isPublic: true,
        name: finalName,
        description: item.description ?? null,
        language: inferLanguage(content),
        content,
        displayAttrs: {},
        placeholderDefs: [],
        favorite: false,
        usageCount: 0,
      }),
    )
    inserted++
  }

  // ─── 汇总 ───
  const finalSubs = await collectionRepo.find({
    where: { parentId: root.id, isPublic: true, userId: IsNull() },
  })
  let totalSnips = 0
  for (const s of finalSubs) {
    totalSnips += await snippetRepo.count({
      where: { collectionId: s.id, isPublic: true },
    })
  }
  console.log(
    `\n导入完成：新增 ${inserted} 条，跳过(空/无效) ${skippedEmpty}，跳过(内容重复) ${skippedDup}，跳过(同名) ${skippedName}，跳过(语义不达标) ${skippedInvalid}`,
  )
  if (invalidReasons.length > 0) {
    console.error(`\n⚠️ 语义闸门拦下 ${invalidReasons.length} 条未写入（标题/描述不达标）：`)
    for (const r of invalidReasons.slice(0, 20)) console.error(`  - ${r}`)
    if (invalidReasons.length > 20) console.error(`  ... 另有 ${invalidReasons.length - 20} 条`)
    process.exitCode = 1
  }
  console.log(
    `前端根集合最终：子集合 ${finalSubs.length} 个，公共片段 ${totalSnips} 条`,
  )
  await dataSource.destroy()
}

main().catch((err) => {
  console.error('导入失败:', err)
  process.exit(1)
})
