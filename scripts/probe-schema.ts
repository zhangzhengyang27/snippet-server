/**
 * 临时探针：对一个**空库**打印 TypeORM 会生成的建表 DDL。
 *
 * 用途：改动实体后，拿到「全新安装所需的准确 DDL」（尤其是 TypeORM 自动生成的
 * 索引名 / 外键名 / 列类型），据此**手写**迁移 —— 项目约定见
 * `src/migrations/1790751735731-Baseline.ts` 头注释（推荐手写迁移而非 generate，
 * 因为 generate 会顺带生成「删除 32 张历史遗留表」的语句）。
 *
 * 运行：`npx ts-node -T scripts/probe-schema.ts [--users]`
 * ⚠️ 必须 `-T`（transpile-only）：tsx/esbuild 缺少 emitDecoratorMetadata，
 *    会让列类型解析失败（ColumnTypeUndefinedError）。
 */
import { DataSource } from 'typeorm';
import base from '../src/data-source';

const PROBE_DB = process.env.PROBE_DB || 'snippet_probe';

interface SqlInMemory {
  upQueries: { query: string }[];
}

async function main() {
  const probe = new DataSource({
    ...(base.options as Record<string, unknown>),
    database: PROBE_DB,
    synchronize: false,
    logging: false,
    migrations: [],
  } as never);

  await probe.initialize();
  const driver = probe.driver as unknown as {
    createSchemaBuilder(): { log(): Promise<SqlInMemory> };
  };
  const { upQueries } = await driver.createSchemaBuilder().log();

  const onlyUsers = process.argv.includes('--users');
  for (const q of upQueries) {
    if (onlyUsers && !/users/i.test(q.query)) continue;
    console.log(`${q.query};`);
  }
  console.log(`-- 共 ${upQueries.length} 条语句`);

  await probe.destroy();
}

void main();
