/**
 * 公共片段托管账号的约定常量（单一来源）。
 *
 * 公共片段（isPublic = true）必须挂在某个真实账号下，不能让 user_id 为 NULL ——
 * 归属给了 admin 也不代表它属于 admin 的个人库，只读语义由 isPublic 表达。
 *
 * 本常量同时被两类调用方使用：
 * 1. 各导入 / seed 脚本（经 `scripts/public-owner.ts` 转发）；
 * 2. `KnowledgeSnippetsService` —— 用于把「用户自己发布的片段」与
 *    「admin 名下 3,414 条运营数据」区分开（scope = mine 时不能让后者涌入「我的代码块」）。
 */
export const PUBLIC_OWNER_USERNAME = 'admin'
