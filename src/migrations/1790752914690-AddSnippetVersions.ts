import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 新增 `snippet_versions` 表（片段版本快照）。
 *
 * ## 为什么这张表在库里早就有了，还要写这条迁移
 * 该表早于当前代码存在（库中有 8/18 的真实历史数据），但当时**没有对应的实体**，
 * 因此不在基线迁移里。本轮补齐版本功能时新增了 `SnippetVersion` 实体，
 * 这条迁移让**全新数据库**也能建出这张表。
 *
 * 现有库中该表已存在，故本迁移已在 `migrations` 表登记为「已应用」，
 * 不会在现有库上重复执行（否则会因表已存在而失败）。
 *
 * ## 与实体的一致性
 * 主键约束名显式写成 `snippet_versions_pkey`（与库一致）；若用 TypeORM 自动生成名
 * （`PK_<hash>`），每次 `migration:generate` 都会产出一条「改主键名」的无意义 diff。
 *
 * ## 已知的松散之处（沿用现状，未擅自收紧）
 * - `snippetId` 是 varchar(36)，而 `ui_knowledge_snippets.id` 是 varchar(12)；
 * - 两表之间**没有外键**，只有普通索引 `idx_snippet_versions_snippetId`。
 *   因此片段删除后版本记录会残留，读接口需自行过滤。
 *   补外键属 schema 变更，需评估存量数据，未在本轮处理。
 */
export class AddSnippetVersions1790752914690 implements MigrationInterface {
  name = 'AddSnippetVersions1790752914690'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "snippet_versions" ("id" character varying(36) NOT NULL, "snippetId" character varying(36) NOT NULL, "authorId" character varying(36), "name" character varying(200) NOT NULL, "description" text, "language" character varying(64) NOT NULL, "content" text, "displayAttrs" jsonb, "message" character varying(32) NOT NULL DEFAULT 'auto', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "snippet_versions_pkey" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "idx_snippet_versions_snippetId" ON "snippet_versions" ("snippetId") `
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "snippet_versions"`)
  }
}
