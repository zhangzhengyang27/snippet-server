import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 片段发布审核：新增 moderation_status / moderation_note / moderated_at 三列。
 *
 * 背景：公开上线后用户可把自己的片段提交到公共库，需经管理员审核。
 * 设计要点（与 is_public 的分工）：
 * - `is_public` 仍是「公共库可见」的**唯一开关**，语义不变 —— 公共库查询只认它，
 *   因此存量 3,414 条运营数据零影响；
 * - `moderation_status` 只记录流程状态（none / pending / approved / rejected）。
 *
 * DDL 由空库探针生成（`PROBE_DB=snippet_probe npx ts-node -T scripts/probe-schema.ts`），
 * 索引名沿用 TypeORM 生成的 `IDX_ae3913782e42474dbf0bf9aa47`，保证与实体定义一致。
 *
 * ⚠️ 探针同时会建议 `DROP CONSTRAINT ck_knowledge_snippets_public_has_owner` ——
 *    那是对「公共片段必须有归属」的既有兜底约束，**故意不删**（实体未声明它，
 *    所以探针每次都报；这是既有的已知残留，见基线迁移头注释）。
 *
 * 幂等写法：ADD COLUMN IF NOT EXISTS + DO $$ 守卫索引，线上库重复执行无害。
 */
export class AddSnippetModerationColumns1791346709368 implements MigrationInterface {
  name = 'AddSnippetModerationColumns1791346709368'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets" ADD COLUMN IF NOT EXISTS "moderation_status" character varying(16) NOT NULL DEFAULT 'none'`,
    )
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets" ADD COLUMN IF NOT EXISTS "moderation_note" character varying(200)`,
    )
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets" ADD COLUMN IF NOT EXISTS "moderated_at" TIMESTAMP WITH TIME ZONE`,
    )

    // 索引：待审核队列按 moderation_status 过滤。守卫避免重复创建。
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'IDX_ae3913782e42474dbf0bf9aa47'
        ) THEN
          CREATE INDEX "IDX_ae3913782e42474dbf0bf9aa47" ON "ui_knowledge_snippets" ("moderation_status");
        END IF;
      END
      $$;
    `)

    // 回填：存量公共片段本来就是「已发布」，不能因为新增流程字段而显示成「未提交」。
    // 条件带 moderation_status = 'none' 保证幂等；直接走 SQL 不会触碰 updated_at
    // （@UpdateDateColumn 只在 ORM 层生效），因此不会把 3,414 条顶到列表最前。
    await queryRunner.query(
      `UPDATE "ui_knowledge_snippets" SET "moderation_status" = 'approved' WHERE "is_public" = true AND "moderation_status" = 'none'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ae3913782e42474dbf0bf9aa47"`)
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets" DROP COLUMN IF EXISTS "moderated_at"`,
    )
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets" DROP COLUMN IF EXISTS "moderation_note"`,
    )
    await queryRunner.query(
      `ALTER TABLE "ui_knowledge_snippets" DROP COLUMN IF EXISTS "moderation_status"`,
    )
  }
}
