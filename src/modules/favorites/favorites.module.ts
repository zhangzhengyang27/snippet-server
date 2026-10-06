import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { Favorite } from './entities/favorite.entity';
import { KnowledgeSnippet } from '../knowledge/entities/knowledge-snippet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Favorite, KnowledgeSnippet])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  // 片段列表/详情要按当前用户标注收藏态，故对外暴露
  exports: [FavoritesService],
})
export class FavoritesModule {}
