import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './modules/auth/entities/user.entity';
import { Favorite } from './modules/favorites/entities/favorite.entity';
import { SnippetCollection } from './modules/knowledge/entities/snippet-collection.entity';
import { KnowledgeSnippet } from './modules/knowledge/entities/knowledge-snippet.entity';
import { KnowledgeSnippetTag } from './modules/knowledge/entities/knowledge-snippet-tag.entity';
import { KnowledgeSnippetTagLink } from './modules/knowledge/entities/knowledge-snippet-tag-link.entity';
import { SnippetVersion } from './modules/knowledge/entities/snippet-version.entity';

/** TypeORM CLI / 种子脚本使用的数据源（与 app.module 的注册保持一致）。 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'html5_examples',
  entities: [
    User,
    Favorite,
    SnippetCollection,
    KnowledgeSnippet,
    KnowledgeSnippetTag,
    KnowledgeSnippetTagLink,
    SnippetVersion,
  ],
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.NODE_ENV === 'development',
  /**
   * 迁移文件目录。
   *
   * 引入迁移是为了让 schema 变更**可审计、可回滚** —— 此前靠 `synchronize` 开关，
   * 上一次标签唯一索引只能手工执行 SQL。基线迁移见
   * `src/migrations/1790751735731-Baseline.ts`（已在现有库登记为已应用）。
   *
   * ⚠️ 库里还有约 32 张不属于当前实体的历史遗留表，`migration:generate` 会生成
   * 「删掉它们」的迁移 —— **不要直接把 generate 的产物拿去跑**，详见基线迁移注释。
   *
   * 用 `__dirname` 相对路径而非写死 `'src/migrations/*.ts'`：前者在 CLI（ts-node，
   * __dirname = src/）与运行时（编译产物，__dirname = dist/）两种上下文下都能正确
   * 解析；写死 `src/` 会让编译产物去加载 .ts 源文件而报错。
   */
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
});
