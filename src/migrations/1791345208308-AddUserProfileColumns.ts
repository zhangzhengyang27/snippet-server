import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 为账号体系补齐 `users` 的档案列：`email` / `display_name` / `last_login_at`。
 *
 * ## DDL 来源
 * 对着一个**空库**跑 `npx ts-node -T scripts/probe-schema.ts`（TypeORM
 * `createSchemaBuilder().log()`）生成，与基线迁移同一套方法 —— 保证「全新库跑完
 * 整迁移链后的 schema」与「实体定义」一致（不手写臆测的列类型/索引名）。
 * 其中 email 的唯一索引名 `IDX_97672ac88f789774dd47f7c8be` 即 TypeORM 生成名。
 *
 * ## 为什么写成 §幂等§
 * 线上库是从原 html5-examples 库沿革来的，**这三列早已存在**（且 email 上已有
 * 唯一约束 `UQ_97672ac88f789774dd47f7c8be3`）。因此：
 *  - `ADD COLUMN IF NOT EXISTS` —— 线上库为 no-op，只对全新库真正生效；
 *  - 唯一索引用 DO 块判断「email 是否已有单列唯一索引」再建 —— 避免在线上库
 *    重复创建一个功能等价的索引。全新库上则按实体名 `IDX_*` 建出唯一索引。
 *
 * ## ⚠️ down 是破坏性的
 * 回滚会 **DROP 掉 email / display_name / last_login_at**，线上库这些列已承载
 * 真实用户数据（如 test@xiaoye.dev 的邮箱），drop 不可恢复。仅在全新/测试库上
 * 才应执行 revert；生产库请先备份（见 `backups/`）。
 */
export class AddUserProfileColumns1791345208308 implements MigrationInterface {
  name = 'AddUserProfileColumns1791345208308';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP WITH TIME ZONE`,
    );

    // email 唯一索引：仅当不存在「单列唯一索引」时创建。
    // 线上库已有等价约束（UQ_*），此块为 no-op；全新库按实体生成名 IDX_* 建出。
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_index i
          JOIN pg_attribute a
            ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE i.indrelid = 'users'::regclass
            AND i.indisunique
            AND array_length(i.indkey, 1) = 1
            AND a.attname = 'email'
        ) THEN
          CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email");
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "display_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email"`);
  }
}
