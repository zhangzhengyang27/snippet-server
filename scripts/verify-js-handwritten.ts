/**
 * 验证「最全 JS 手写题」已写入代码块页面的公共集合。
 * 直接通过 server/src/data-source.ts 读库（无需 HTTP Server）。
 *
 * 运行：cd server && npx ts-node -r reflect-metadata -r tsconfig-paths/register scripts/verify-js-handwritten.ts
 *
 * ## 归属口径（2026-10-01 起，见 scripts/public-owner.ts）
 * - 公共**片段**：`is_public = true` 且 `user_id` 指向托管账号 admin，**不再**是 `user_id IS NULL`；
 * - 公共**集合**：仍以 `user_id IS NULL` 表达。
 *
 * 早先版本对片段也按 `userId IS NULL` 过滤，在改造后恒等于 0（读起来像"数据没了"），
 * 且脏数据检查会把 3399 条正常归属的片段全部误判为异常 —— 本版按上述口径修正。
 */
import dataSource from '../src/data-source'
import { IsNull } from 'typeorm'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'
import { resolvePublicOwner } from './public-owner'

async function main() {
  await dataSource.initialize()

  const collRepo = dataSource.getRepository(SnippetCollection)
  const snipRepo = dataSource.getRepository(KnowledgeSnippet)
  const publicOwner = await resolvePublicOwner(dataSource)

  // 1) 全局公共集合 / 片段计数
  const totalColl = await collRepo.count({ where: { isPublic: true, userId: IsNull() } })
  const totalSnip = await snipRepo.count({
    where: { isPublic: true, userId: publicOwner.id },
  })

  // 2) 顶层根集合（parentId = null）
  const roots = await collRepo.find({
    where: { isPublic: true, userId: IsNull(), parentId: IsNull() },
    order: { name: 'ASC' },
  })

  console.log('=== 公共集合 / 片段总数 ===')
  console.log(`集合：${totalColl}，片段：${totalSnip}`)
  console.log('\n=== 顶层根集合及子节点统计 ===')

  for (const root of roots) {
    const children = await collRepo.find({
      where: { isPublic: true, userId: IsNull(), parentId: root.id },
      order: { order: 'ASC', name: 'ASC' },
    })
    // 该根下所有集合（含叶子）的片段总数
    const childIds = children.map((c) => c.id).concat(root.id)
    const snipCount = await snipRepo.count({
      where: childIds.map((id) => ({
        isPublic: true,
        userId: publicOwner.id,
        collectionId: id,
      })),
    })
    console.log(`\n📁 ${root.name}（集合 ${children.length + 1} 个，片段 ${snipCount} 个）`)
    for (const child of children) {
      const cnt = await snipRepo.count({
        where: { isPublic: true, userId: publicOwner.id, collectionId: child.id },
      })
      console.log(`   ├─ ${child.name}（片段 ${cnt} 个）`)
    }
  }

  // 3) 抽样校验：公共数据不得出现「非公共 / 归属异常」（应为 0）
  const dirtyColl = await collRepo
    .createQueryBuilder('c')
    .where('c.is_public = false OR c.user_id IS NOT NULL')
    .getCount()
  const dirtySnip = await snipRepo
    .createQueryBuilder('s')
    .where('s.is_public = false OR s.user_id IS DISTINCT FROM :ownerId', {
      ownerId: publicOwner.id,
    })
    .getCount()
  console.log('\n=== 脏数据检查（应为 0）===')
  console.log(`非公共集合：${dirtyColl}，归属异常片段：${dirtySnip}`)

  await dataSource.destroy()
}

main().catch(async (err) => {
  console.error('❌ 验证失败：', err)
  await dataSource.destroy()
  process.exit(1)
})
