import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 约束：公共片段必须有归属（user_id 不能为 NULL）。
 *
 * ## 背景
 * 导入公共片段的脚本历史上把 `user_id` 写死为 NULL，理由是「公共片段不属于任何人」。
 * 结果库里 3232 条公共片段查不到归属：
 * - 外键形同虚设，无法按归属做审计、回收或批量维护；
 * - 与前端「公共片段挂在托管账号下」的后续约定互相矛盾。
 * 已通过一次性数据治理把这批片段统一挂到托管账号 admin 名下。
 *
 * ## 为什么用 CHECK 而不是只改代码
 * 只改脚本堵不住下一次：任何手写 SQL、临时脚本、或回滚到旧版本的代码都能再写入
 * NULL 归属。落在库上的 CHECK 让违规写入直接报错，属于不可绕过的兜底。
 *
 * ## 为什么不对私有片段同样要求
 * 私有片段理论上也可能出现 NULL（历史脏数据），本轮只固化已经治理干净的公共侧，
 * 避免一次性收紧过多导致存量数据导入失败。
 */
export class PublicSnippetRequiresOwner1790823787649 implements MigrationInterface {
  name = 'PublicSnippetRequiresOwner1790823787649'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets"
         ADD CONSTRAINT "ck_knowledge_snippets_public_has_owner"
         CHECK (NOT is_public OR user_id IS NOT NULL)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets"
         DROP CONSTRAINT IF EXISTS "ck_knowledge_snippets_public_has_owner"`,
    )
  }
}
