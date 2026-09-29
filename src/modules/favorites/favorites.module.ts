import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { Favorite } from './entities/favorite.entity';
import { Example } from '../examples/entities/example.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Favorite, Example])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
