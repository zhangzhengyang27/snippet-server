import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { User } from './modules/auth/entities/user.entity';
import { Favorite } from './modules/favorites/entities/favorite.entity';
import { SnippetCollection } from './modules/knowledge/entities/snippet-collection.entity';
import { KnowledgeSnippet } from './modules/knowledge/entities/knowledge-snippet.entity';
import { KnowledgeSnippetTag } from './modules/knowledge/entities/knowledge-snippet-tag.entity';
import { KnowledgeSnippetTagLink } from './modules/knowledge/entities/knowledge-snippet-tag-link.entity';
import { SnippetVersion } from './modules/knowledge/entities/snippet-version.entity';
import { AuthModule } from './modules/auth/auth.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { KnowledgeSnippetsModule } from './modules/knowledge/snippets/knowledge-snippets.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';

/**
 * Snippet 后端（html5-examples server 的裁剪装配版）：
 * 只保留 snippet 前端消费的 Auth / Favorites / KnowledgeSnippets 三域。
 * drive、图表、画布、UI 模板等模块文件归档在 ../_archive，未删除。
 *
 * 示例库（Examples）已整体下线：示例数据与前端页面一并移除，`favorites`
 * 改为按用户收藏知识片段（见 favorites 模块）。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRoot({
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
       * 迁移配置（与 data-source.ts 保持一致）。
       *
       * `migrationsRun: false` 是刻意的：迁移由开发者**显式执行**
       * （`npm run migration:run`），不在应用启动时自动跑 —— 避免多实例部署时
       * 并发执行 DDL，也避免一次误重启就改了库。
       *
       * 基线迁移已在现有库登记为已应用，详见
       * `src/migrations/1790751735731-Baseline.ts`。
       */
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsTableName: 'migrations',
      migrationsRun: false,
    }),
    AuthModule,
    FavoritesModule,
    KnowledgeSnippetsModule,
    RateLimitModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
