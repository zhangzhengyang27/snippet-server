import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './src/modules/auth/entities/user.entity';
import { Favorite } from './src/modules/favorites/entities/favorite.entity';
import { SnippetCollection } from './src/modules/knowledge/entities/snippet-collection.entity';
import { KnowledgeSnippet } from './src/modules/knowledge/entities/knowledge-snippet.entity';
import { KnowledgeSnippetTag } from './src/modules/knowledge/entities/knowledge-snippet-tag.entity';
import { KnowledgeSnippetTagLink } from './src/modules/knowledge/entities/knowledge-snippet-tag-link.entity';

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
  ],
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.NODE_ENV === 'development',
});
