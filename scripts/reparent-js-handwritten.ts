/**
 * 迁移：把「JS 手写题」「设计模式」从一级集合改为挂在「前端」下的二级集合，
 * 并拍平其下的「题」子集合（三级）——子集合里的片段直接移到二级集合下，
 * 子集合本身删除。片段内容与质量说明全部保留，不丢数据。
 *
 * 背景：此前按 md 文件结构把它们建成了与「前端」平级的一级集合，且多套了一层
 * 「题」子集合；但代码块页面约定是「前端(一级) → 主题(二级) → 片段列表(无三级)」。
 *
 * 运行：cd server && npx ts-node -r reflect-metadata -r tsconfig-paths/register scripts/reparent-js-handwritten.ts
 */
import dataSource from '../src/data-source'
import { IsNull } from 'typeorm'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'

async function main() {
  await dataSource.initialize()
  console.log('✅ 数据库连接成功')

  const collRepo = dataSource.getRepository(SnippetCollection)
  const snipRepo = dataSource.getRepository(KnowledgeSnippet)

  const front = await collRepo.findOne({
    where: { name: '前端', parentId: IsNull(), isPublic: true },
  })
  if (!front) throw new Error('未找到「前端」一级集合，迁移终止')

  for (const catName of ['JS 手写题', '设计模式']) {
    const cat = await collRepo.findOne({
      where: { name: catName, parentId: IsNull(), isPublic: true },
    })
    if (!cat) {
      console.log(`⚠️ 跳过：未找到顶级集合「${catName}」（可能已迁移）`)
      continue
    }

    // 1) 重新挂到「前端」下，成为二级集合
    cat.parentId = front.id
    await collRepo.save(cat)
    console.log(`\n📁 「${catName}」已挂到「前端」下（二级）`)

    // 2) 拍平其下的「题」子集合：片段上移、子集合删除
    const children = await collRepo.find({ where: { parentId: cat.id, isPublic: true } })
    for (const child of children) {
      const snips = await snipRepo.find({ where: { collectionId: child.id, isPublic: true } })
      for (const s of snips) {
        s.collectionId = cat.id
        await snipRepo.save(s)
      }
      await collRepo.remove(child)
      console.log(`   ↳ 合并子集合「${child.name}」的 ${snips.length} 个片段到「${catName}」，并删除该子集合`)
    }

    const cnt = await snipRepo.count({ where: { collectionId: cat.id, isPublic: true } })
    console.log(`✅ 「${catName}」现直接持有 ${cnt} 个片段（无三级子集合）`)
  }

  await dataSource.destroy()
}

main().catch(async (err) => {
  console.error('❌ 迁移失败：', err)
  await dataSource.destroy()
  process.exit(1)
})
