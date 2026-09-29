import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Topic } from './src/modules/topics/entities/topic.entity';
import { Category } from './src/modules/categories/entities/category.entity';
import { Example } from './src/modules/examples/entities/example.entity';
import { Favorite } from './src/modules/favorites/entities/favorite.entity';
import { StaticSiteNav } from './src/modules/static-site-nav/entities/static-site-nav.entity';
import { UiElementTemplate } from './src/modules/ui-elements/entities/ui-element-template.entity';
import { UiElementCategory } from './src/modules/ui-elements/entities/ui-element-category.entity';
import { VisualDemo } from './src/modules/visual-demos/entities/visual-demo.entity';
import { ChartExample } from './src/modules/chart-examples/entities/chart-example.entity';
import { User } from './src/modules/auth/entities/user.entity';
import {
  KnowledgeBase,
  KnowledgeDocument,
  DocumentVersion,
  DocumentShare,
  RecentView,
  KnowledgeFavorite,
  Comment,
  Notification,
  DriveFile,
  DriveFileVersion,
  DriveFileShare,
  DriveUploadSession,
  DriveQuota,
  DriveArchiveTask,
  SnippetCollection,
  KnowledgeSnippet,
  KnowledgeSnippetTag,
  KnowledgeSnippetTagLink,
  BoardLibrary,
  BoardLibraryAsset,
  RefreshToken,
  CaptchaChallenge,
} from './src/modules/knowledge/entities';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'html5_examples',
  entities: [
    Topic,
    Category,
    Example,
    Favorite,
    StaticSiteNav,
    UiElementTemplate,
    UiElementCategory,
    VisualDemo,
    ChartExample,
    User,
    KnowledgeBase,
    KnowledgeDocument,
    DocumentVersion,
    DocumentShare,
    RecentView,
    KnowledgeFavorite,
    Comment,
    Notification,
    DriveFile,
    DriveFileVersion,
    DriveFileShare,
    DriveUploadSession,
    DriveQuota,
    DriveArchiveTask,
    SnippetCollection,
    KnowledgeSnippet,
    KnowledgeSnippetTag,
    KnowledgeSnippetTagLink,
    BoardLibrary,
    BoardLibraryAsset,
    RefreshToken,
    CaptchaChallenge,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
