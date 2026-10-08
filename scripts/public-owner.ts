/**
 * 公共片段托管账号解析（供各导入 / seed 脚本共用）
 *
 * 约定：公共片段（isPublic = true）必须挂在某个真实账号下，不能让 user_id 为 NULL。
 * 原因：
 * - user_id 为 NULL 时外键形同虚设，归属校验、回收与审计都无从下手；
 * - 历史导入脚本曾写死 NULL，导致 3232 条公共片段查不到归属，需要靠一次性 SQL 治理补回来。
 *
 * 只读语义由 isPublic 表达，与归属给谁无关 —— 托管给 admin 不代表 admin 个人库内容，
 * 前端仍然按 isPublic 关闭编辑 / 删除 / 版本入口。
 */
import { DataSource } from 'typeorm'
import { User } from '../src/modules/auth/entities/user.entity'
import { PUBLIC_OWNER_USERNAME } from '../src/modules/knowledge/snippets/public-owner.util'

// 常量单一来源在 src 侧，这里转发，避免服务端与脚本各写一份「admin」而漂移。
export { PUBLIC_OWNER_USERNAME }

/**
 * 解析公共片段托管账号的 id。
 * 找不到账号时直接抛错：宁可导入失败，也不要再产生一批无归属的片段。
 */
export async function resolvePublicOwner(dataSource: DataSource): Promise<User> {
  const owner = await dataSource.getRepository(User).findOne({
    where: { username: PUBLIC_OWNER_USERNAME },
  })

  if (!owner) {
    throw new Error(
      `未找到公共片段托管账号「${PUBLIC_OWNER_USERNAME}」，请先创建该用户再执行导入。`,
    )
  }

  return owner
}
