import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './modules/auth/entities/user.entity';
import { Example } from './modules/examples/entities/example.entity';
import { Favorite } from './modules/favorites/entities/favorite.entity';
import { SnippetCollection } from './modules/knowledge/entities/snippet-collection.entity';
import { KnowledgeSnippet } from './modules/knowledge/entities/knowledge-snippet.entity';
import { KnowledgeSnippetTag } from './modules/knowledge/entities/knowledge-snippet-tag.entity';
import { KnowledgeSnippetTagLink } from './modules/knowledge/entities/knowledge-snippet-tag-link.entity';

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
    Example,
    Favorite,
    SnippetCollection,
    KnowledgeSnippet,
    KnowledgeSnippetTag,
    KnowledgeSnippetTagLink,
  ],
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.NODE_ENV === 'development',
});
