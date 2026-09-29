import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './entities/favorite.entity';
import { Example } from '../examples/entities/example.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private favoriteRepository: Repository<Favorite>,
    @InjectRepository(Example)
    private exampleRepository: Repository<Example>,
  ) {}

  /**
   * 获取用户收藏的所有示例，按收藏时间倒序。
   */
  async findAll(userId: string): Promise<Example[]> {
    return this.exampleRepository
      .createQueryBuilder('example')
      .innerJoin(
        Favorite,
        'favorite',
        'favorite.example_id = example.id AND favorite.user_id = :userId',
        { userId },
      )
      .orderBy('favorite.created_at', 'DESC')
      .addOrderBy('example.id', 'ASC')
      .getMany();
  }

  /**
   * 收藏示例。
   */
  async add(userId: string, exampleId: string): Promise<Favorite> {
    const example = await this.exampleRepository.findOne({ where: { id: exampleId } });
    if (!example) {
      throw new NotFoundException(`示例 ${exampleId} 不存在`);
    }

    // 幂等：重复收藏（双击/并发）直接返回现有记录，避免唯一约束 500
    const existing = await this.favoriteRepository.findOne({ where: { userId, exampleId } });
    if (existing) {
      return existing;
    }

    const favorite = this.favoriteRepository.create({ userId, exampleId });
    return this.favoriteRepository.save(favorite);
  }

  /**
   * 取消收藏示例。
   */
  async remove(userId: string, exampleId: string): Promise<{ message: string }> {
    const result = await this.favoriteRepository.delete({ userId, exampleId });
    if (result.affected === 0) {
      throw new NotFoundException('收藏记录不存在');
    }
    return { message: `已取消收藏 ${exampleId}` };
  }

  /**
   * 检查某示例是否已被用户收藏。
   */
  async isFavorite(userId: string, exampleId: string): Promise<boolean> {
    const count = await this.favoriteRepository.count({ where: { userId, exampleId } });
    return count > 0;
  }
}
