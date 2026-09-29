import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { Topic } from './modules/topics/entities/topic.entity';
import { Category } from './modules/categories/entities/category.entity';
import { Example } from './modules/examples/entities/example.entity';
import { User } from './modules/auth/entities/user.entity';
import { AuthModule } from './modules/auth/auth.module';
import { TopicsModule } from './modules/topics/topics.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ExamplesModule } from './modules/examples/examples.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { Favorite } from './modules/favorites/entities/favorite.entity';
import { StaticSiteNavModule } from './modules/static-site-nav/static-site-nav.module';
import { StaticSiteNav } from './modules/static-site-nav/entities/static-site-nav.entity';
import { UiElementsModule } from './modules/ui-elements/ui-elements.module';
import { UiElementTemplate } from './modules/ui-elements/entities/ui-element-template.entity';
import { UiElementCategory } from './modules/ui-elements/entities/ui-element-category.entity';
import { VisualDemosModule } from './modules/visual-demos/visual-demos.module'
import { VisualDemo } from './modules/visual-demos/entities/visual-demo.entity';
import { ChartExamplesModule } from './modules/chart-examples/chart-examples.module';
import { ChartExample } from './modules/chart-examples/entities/chart-example.entity';
import { CanvasExamplesModule } from './modules/canvas-examples/canvas-examples.module';
import { CanvasExample } from './modules/canvas-examples/entities/canvas-example.entity';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'html5_examples',
      entities: [Topic, Category, Example, User, Favorite, StaticSiteNav, UiElementTemplate, UiElementCategory, VisualDemo, ChartExample, CanvasExample],
      synchronize: process.env.DB_SYNC === 'true',
      logging: process.env.NODE_ENV === 'development',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'admin'),
      serveRoot: '/admin',
      exclude: ['/api/(.*)'],
    }),
    AuthModule,
    TopicsModule,
    CategoriesModule,
    ExamplesModule,
    FavoritesModule,
    StaticSiteNavModule,
    UiElementsModule,
    VisualDemosModule,
    ChartExamplesModule,
    CanvasExamplesModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
