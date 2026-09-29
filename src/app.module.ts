import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { User } from './modules/auth/entities/user.entity';
import { Example } from './modules/examples/entities/example.entity';
import { Favorite } from './modules/favorites/entities/favorite.entity';
import { SnippetCollection } from './modules/knowledge/entities/snippet-collection.entity';
import { KnowledgeSnippet } from './modules/knowledge/entities/knowledge-snippet.entity';
import { KnowledgeSnippetTag } from './modules/knowledge/entities/knowledge-snippet-tag.entity';
import { KnowledgeSnippetTagLink } from './modules/knowledge/entities/knowledge-snippet-tag-link.entity';
import { AuthModule } from './modules/auth/auth.module';
import { ExamplesModule } from './modules/examples/examples.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { KnowledgeSnippetsModule } from './modules/knowledge/snippets/knowledge-snippets.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

/**
 * Snippet 后端（html5-examples server 的裁剪装配版）：
 * 只保留 snippet 前端消费的 Auth / Examples / Favorites / KnowledgeSnippets 四域。
 * drive、图表、画布、UI 模板等模块文件归档在 ../_archive，未删除。
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
        Example,
        Favorite,
        SnippetCollection,
        KnowledgeSnippet,
        KnowledgeSnippetTag,
        KnowledgeSnippetTagLink,
      ],
      synchronize: process.env.DB_SYNC === 'true',
      logging: process.env.NODE_ENV === 'development',
    }),
    AuthModule,
    ExamplesModule,
    FavoritesModule,
    KnowledgeSnippetsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
