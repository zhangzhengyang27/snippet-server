import dataSource from '../data-source'
import { StaticSiteNav } from '../src/modules/static-site-nav/entities/static-site-nav.entity'

const IDS = [
  186, 187, 188, 189, 190, 191, 192, 193,
  194, 195, 196, 197, 198, 199, 200, 201,
]

async function main() {
  await dataSource.initialize()
  const repo = dataSource.getRepository(StaticSiteNav)

  const existing = await repo.find({ where: IDS.map((id) => ({ id })) })
  console.log(`DB 中匹配到 ${existing.length} 条（期望 16）:`)
  for (const r of existing) {
    console.log(`  #${r.id}  category=${r.category}  entryUrl=${r.entryUrl}`)
  }

  // 复核：这些 entryUrl 本地目录都应不存在
  const fs = require('fs')
  const PUBLIC = '/Users/xiaoye/Desktop/html5-examples/public'
  const bad = existing.filter(
    (r) => fs.existsSync(PUBLIC + (r.entryUrl as string)),
  )
  if (bad.length) {
    console.error(`⚠️ 有 ${bad.length} 条记录本地目录竟存在，中止以防误删:`, bad.map((b) => b.id))
    await dataSource.destroy()
    process.exit(1)
  }

  if (existing.length !== IDS.length) {
    console.error(`⚠️ 匹配数量(${existing.length})与期望(${IDS.length})不符，中止`)
    await dataSource.destroy()
    process.exit(1)
  }

  const res = await repo.delete(IDS)
  console.log(`已删除 ${res.affected} 条`)

  const remain = await repo.count()
  console.log(`static_site_nav 剩余总数: ${remain}`)

  await dataSource.destroy()
}

main().catch((e) => {
  console.error('脚本失败:', e)
  process.exit(1)
})
