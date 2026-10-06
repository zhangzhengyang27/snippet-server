import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Favorite } from './entities/favorite.entity';
import { KnowledgeSnippet } from '../knowledge/entities/knowledge-snippet.entity';

/**
 * 按用户的代码块收藏。
 *
 * 「收藏态」在接口响应里通过 KnowledgeSnippet.favorite 暴露，由
 * KnowledgeSnippetsService 调 {@link resolveFavoriteIds} 计算 —— 前端因此
 * 无需再维护一份全局收藏列表。
 */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
    @InjectRepository(KnowledgeSnippet)
    private readonly snippetRepository: Repository<KnowledgeSnippet>,
  ) {}

  /**
   * 收藏代码块。
   *
   * 仅校验「片段存在且对当前用户可见」，**不要求归属** —— 这正是公共片段
   * （归属托管账号）能被普通用户收藏的前提。
   */
  async add(userId: string, snippetId: string): Promise<Favorite> {
    const snippet = await this.snippetRepository.findOne({ where: { id: snippetId } });
    if (!snippet || (!snippet.isPublic && snippet.userId !== userId)) {
      throw new NotFoundException(`代码块 ${snippetId} 不存在`);
    }

    // 幂等：重复收藏（双击/并发）直接返回现有记录，避免唯一约束抛 500
    const existing = await this.favoriteRepository.findOne({ where: { userId, snippetId } });
    if (existing) {
      return existing;
    }

    return this.favoriteRepository.save(this.favoriteRepository.create({ userId, snippetId }));
  }

  /** 取消收藏。重复取消返回 404，让前端能区分「真的删掉了」与「本来就没有」。 */
  async remove(userId: string, snippetId: string): Promise<{ message: string }> {
    const result = await this.favoriteRepository.delete({ userId, snippetId });
    if (result.affected === 0) {
      throw new NotFoundException('收藏记录不存在');
    }
    return { message: `已取消收藏 ${snippetId}` };
  }

  /**
   * 批量取「该用户收藏了这批片段中的哪些」。
   *
   * 把列表里 N 条片段的收藏态压缩成 1 次查询；未登录直接返回空集
   * （未登录没有「我的收藏」）。
   */
  async resolveFavoriteIds(userId: string | null, snippetIds: string[]): Promise<Set<string>> {
    if (!userId || snippetIds.length === 0) {
      return new Set();
    }
    const rows = await this.favoriteRepository.find({
      where: { userId, snippetId: In(snippetIds) },
      select: { snippetId: true },
    });
    return new Set(rows.map((row) => row.snippetId));
  }
}
