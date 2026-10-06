import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 基线迁移（baseline）：把「当前代码所定义的完整 schema」固化为一份可重放的 DDL。
 *
 * ## 为什么需要它
 * 此前 schema 靠 `synchronize` 开关维护（`DB_SYNC === 'true'`），变更**无法审计、
 * 无法回滚** —— 上一次标签唯一索引就是手工执行 SQL 修的。引入 migration 后，
 * 所有 schema 变更都变成可 review、可回滚的文件。
 *
 * ## 这份 DDL 是怎么来的
 * 对着一个**空库**跑 TypeORM 的 `createSchemaBuilder().log()` 生成，因此它等价于
 * 「全新安装所需的全部建表语句」，共 26 条（6 张表 + 索引 + 外键）。
 * （`snippet_versions` 由后续迁移 AddSnippetVersions 创建，不在此列。）
 *
 * 与线上库的差异：线上库是从原 html5-examples 库沿革下来的，存在**系统性历史
 * 漂移** —— `users` 多出 display_name / avatar / email / phone / last_login_at
 * 等列且若干默认值不同，`ui_knowledge_snippet_tags` 多一个指向 users 的外键，
 * 若干索引名也被手工改过；`favorites` 的级联外键线上叫 `fk_favorites_snippet_id`
 * （示例库下线时手工 SQL 所加），此处按实体的 `@ManyToOne` 声明生成，名字是
 * TypeORM 风格的 `FK_73e51e509d6f97790a00da8328c` —— 语义一致（均 ON DELETE CASCADE）。
 *
 * 本文件刻意**只反映当前实体的定义**，不追平这些漂移 —— 这样面向全新库的
 * schema 才是自洽的（`migration:generate` 在全新库上零差异）。追平历史漂移
 * 属于另一件事，不应混进这份基线。
 *
 * ## 为什么它已被标记为「已应用」
 * 现有数据库里这 7 张表**早就存在**，直接 `migration:run` 会因表已存在而失败。
 * 因此本迁移已在 `migrations` 表登记为已应用（见 README 说明），
 * 它只在**全新数据库**上才会真正执行。
 *
 * ## ⚠️ 使用 migration:generate 前必读
 * 库里存在约 32 张**不属于当前实体**的历史遗留表（drive / 画板 / 图表等已归档模块
 * 留下的）。TypeORM 对比的是「实体 ↔ 库」，因此 `migration:generate` 会生成一份
 * **删掉这些遗留表**的迁移。
 * → **不要直接把 generate 的产物拿去跑**；请把它当参考，手工裁剪后再提交。
 *    推荐做法是手写迁移，而不是 generate。
 *
 * 历史遗留：`migrations` 表里还有 10 条早于本次的记录（InitialSchema 等），
 * 其迁移文件已在数据丢失事故中丢失，保留记录不影响运行。
 */
export class Baseline1790751735731 implements MigrationInterface {
  name = 'Baseline1790751735731'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(50) NOT NULL, "password" character varying(100) NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'user', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"));`)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username") ;`)
    await queryRunner.query(`CREATE TABLE "favorites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying(64) NOT NULL, "snippet_id" character varying(12) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_890818d27523748dd36a4d1bdc8" PRIMARY KEY ("id"));`)
    await queryRunner.query(`CREATE INDEX "IDX_35a6b05ee3b624d0de01ee5059" ON "favorites" ("user_id") ;`)
    await queryRunner.query(`CREATE INDEX "IDX_73e51e509d6f97790a00da8328" ON "favorites" ("snippet_id") ;`)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f7b5b29ff4ca9ce1effda5d4bb" ON "favorites" ("user_id", "snippet_id") ;`)
    await queryRunner.query(`CREATE TABLE "ui_snippet_collections" ("id" character varying(12) NOT NULL, "user_id" uuid, "parent_id" character varying(12), "is_public" boolean NOT NULL DEFAULT false, "name" character varying(120) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_093aeafa9b9f3d4891d6694d605" PRIMARY KEY ("id"));`)
    await queryRunner.query(`CREATE INDEX "IDX_633824f2e33b3df22ef741fcbc" ON "ui_snippet_collections" ("user_id") ;`)
    await queryRunner.query(`CREATE INDEX "IDX_d62ac31b5a204f74a3ed7b339e" ON "ui_snippet_collections" ("parent_id") ;`)
    await queryRunner.query(`CREATE INDEX "IDX_feb53c1db3cfbd76ea3dfe77c2" ON "ui_snippet_collections" ("is_public") ;`)
    await queryRunner.query(`CREATE TABLE "ui_knowledge_snippet_tags" ("id" character varying(12) NOT NULL DEFAULT '', "name" character varying(60) NOT NULL, "user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_222fc0a6f82c6f66c7caf0577ec" PRIMARY KEY ("id"));`)
    await queryRunner.query(`CREATE INDEX "IDX_d9a708d7ca8a9eb8176555dd78" ON "ui_knowledge_snippet_tags" ("user_id") ;`)
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_knowledge_snippet_tags_user_name" ON "ui_knowledge_snippet_tags" ("user_id", "name") ;`)
    await queryRunner.query(`CREATE TABLE "ui_knowledge_snippet_tag_links" ("snippet_id" character varying(12) NOT NULL, "tag_id" character varying(12) NOT NULL, "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_134baeee7908f293ab7db2c18a3" PRIMARY KEY ("snippet_id", "tag_id"));`)
    await queryRunner.query(`CREATE INDEX "IDX_131dba17f60504d5ad1b31aead" ON "ui_knowledge_snippet_tag_links" ("tag_id") ;`)
    await queryRunner.query(`CREATE TABLE "ui_knowledge_snippets" ("id" character varying(12) NOT NULL, "user_id" uuid, "collection_id" character varying(12), "is_public" boolean NOT NULL DEFAULT false, "name" character varying(160) NOT NULL, "description" character varying(400), "language" character varying(64) NOT NULL, "content" text NOT NULL, "display_attrs" jsonb NOT NULL DEFAULT '{}', "placeholder_defs" jsonb NOT NULL DEFAULT '[]', "favorite" boolean NOT NULL DEFAULT false, "usage_count" integer NOT NULL DEFAULT '0', "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cf40963fc17d53719e449925012" PRIMARY KEY ("id"));`)
    await queryRunner.query(`CREATE INDEX "IDX_d2a6c72f3306b1a062eec6a6ba" ON "ui_knowledge_snippets" ("user_id") ;`)
    await queryRunner.query(`CREATE INDEX "IDX_2e6e52f6c235a58ef9e38b4f6b" ON "ui_knowledge_snippets" ("collection_id") ;`)
    await queryRunner.query(`CREATE INDEX "IDX_d7fc837f09cc5c70e6214f786d" ON "ui_knowledge_snippets" ("is_public") ;`)
    await queryRunner.query(`ALTER TABLE "ui_snippet_collections" ADD CONSTRAINT "FK_633824f2e33b3df22ef741fcbcd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;`)
    await queryRunner.query(`ALTER TABLE "ui_snippet_collections" ADD CONSTRAINT "FK_d62ac31b5a204f74a3ed7b339e4" FOREIGN KEY ("parent_id") REFERENCES "ui_snippet_collections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;`)
    await queryRunner.query(`ALTER TABLE "ui_knowledge_snippet_tag_links" ADD CONSTRAINT "FK_a6dd11263ee16b179fe702d8d9d" FOREIGN KEY ("snippet_id") REFERENCES "ui_knowledge_snippets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;`)
    await queryRunner.query(`ALTER TABLE "ui_knowledge_snippet_tag_links" ADD CONSTRAINT "FK_131dba17f60504d5ad1b31aeadd" FOREIGN KEY ("tag_id") REFERENCES "ui_knowledge_snippet_tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;`)
    await queryRunner.query(`ALTER TABLE "ui_knowledge_snippets" ADD CONSTRAINT "FK_d2a6c72f3306b1a062eec6a6ba6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;`)
    await queryRunner.query(`ALTER TABLE "ui_knowledge_snippets" ADD CONSTRAINT "FK_2e6e52f6c235a58ef9e38b4f6b0" FOREIGN KEY ("collection_id") REFERENCES "ui_snippet_collections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;`)
    // favorites.snippet_id → ui_knowledge_snippets（实体以 @ManyToOne 声明，级联删除收藏）
    await queryRunner.query(`ALTER TABLE "favorites" ADD CONSTRAINT "FK_73e51e509d6f97790a00da8328c" FOREIGN KEY ("snippet_id") REFERENCES "ui_knowledge_snippets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 按外键依赖逆序删除（先删引用方）
    await queryRunner.query(`DROP TABLE IF EXISTS "ui_knowledge_snippet_tag_links" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "ui_knowledge_snippet_tags" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "ui_knowledge_snippets" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "ui_snippet_collections" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "favorites" CASCADE`)
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`)
  }
}
