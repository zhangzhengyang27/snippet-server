/**
 * 片段语义闸门 —— dry-run 校验。
 *
 * 用途：在真正跑 seed / import 之前，或任何时候，用与写入口**完全同一套规则**扫一遍，
 * 确认「哪些条目会被闸门拦下」。不写库、不改数据。
 *
 * 用法：
 *   1) 全库回归（确认闸门没误伤既有数据）
 *      npx ts-node --transpile-only -P tsconfig.json scripts/verify-snippet-metadata.ts
 *   2) 预演一个数据文件 / 目录（seed / import 的“试运行”）
 *      npx ts-node --transpile-only -P tsconfig.json scripts/verify-snippet-metadata.ts --file <path>
 *
 * 退出码：0 = 全部合格；1 = 存在违规（可被 CI 用来卡住脏数据回库）。
 */
import 'dotenv/config'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import {
  checkSnippetMetadata,
  formatIssues,
  type SnippetMetadataIssue,
} from '../src/modules/knowledge/snippets/snippet-metadata.util'

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'html5_examples',
  entities: ['dist/**/*.entity.{js,ts}', 'src/**/*.entity.ts'],
})

interface Row {
  id?: string
  name?: string
  description?: string | null
}

const collectFiles = (target: string): string[] => {
  if (!existsSync(target)) {
    console.error(`路径不存在：${target}`)
    process.exit(2)
  }
  if (statSync(target).isDirectory()) {
    return readdirSync(target)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(target, f))
  }
  return [target]
}

const extractRows = (raw: unknown): Row[] => {
  const data = raw as { snippets?: unknown[] } & Record<string, unknown>
  if (Array.isArray(data.snippets)) return data.snippets as Row[]
  if (Array.isArray(raw)) return raw as Row[]
  throw new Error('文件里找不到 snippets 数组，也不被认为是数组')
}

const summarize = (rows: Row[], label: string): number => {
  const byCode = new Map<string, number>()
  const samples: Array<{ label: string; name: string; issues: SnippetMetadataIssue[] }> = []
  let bad = 0
  for (const row of rows) {
    const issues = checkSnippetMetadata({ name: row.name, description: row.description })
    if (issues.length === 0) continue
    bad++
    for (const issue of issues) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1)
    if (samples.length < 12) samples.push({ label, name: String(row.name ?? '(无标题)'), issues })
  }
  console.log(`\n${label}：共 ${rows.length} 条，闸门拦下 ${bad} 条`)
  if (bad === 0) return 0
  console.log('按规则分布：')
  for (const [code, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(24)} ${n}`)
  }
  console.log('示例：')
  for (const s of samples) console.log(`  - ${s.name}（${s.issues.map((i) => i.code).join(',')}）${formatIssues(s.issues)}`)
  return bad
}

const run = async () => {
  const fileArgIndex = process.argv.indexOf('--file')
  const invalidArg = process.argv.find((a) => a.startsWith('--') && a !== '--file')
  if (invalidArg) {
    console.error(`未知参数：${invalidArg}（本脚本只接受 --file <path>）`)
    process.exit(2)
  }

  const rows: Row[] = []
  if (fileArgIndex > -1) {
    const target = process.argv[fileArgIndex + 1]
    if (!target) {
      console.error('--file 后面要跟路径')
      process.exit(2)
    }
    for (const file of collectFiles(target)) {
      const parsed = JSON.parse(readFileSync(file, 'utf-8'))
      rows.push(...extractRows(parsed).map((r) => ({ ...r, id: r.id ?? file })))
    }
  } else {
    const res = await dataSource.initialize()
    const repo = res.getRepository('ui_knowledge_snippets')
    const found = await repo.find({ select: ['id', 'name', 'description'] })
    rows.push(...found.map((r) => ({ id: r.id, name: r.name, description: r.description })))
  }

  const bad = summarize(rows, fileArgIndex > -1 ? '数据文件' : '全库')
  if (fileArgIndex === -1) await dataSource.destroy()
  console.log(bad === 0 ? '\n✅ 闸门未拦下任何条目（既有数据全部合规）' : `\n❌ 有 ${bad} 条会被闸门拦下`)
  process.exit(bad === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('校验失败：', err)
  process.exit(2)
})
