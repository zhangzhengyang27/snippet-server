import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SnippetVersion } from '../entities/snippet-version.entity';
import { KnowledgeSnippet } from '../entities/knowledge-snippet.entity';
import { generateId } from '../../../common/utils/id.util';
import { clampPage, clampPageSize } from '../../../common/utils/pagination.util';
import { extractSnippetPlaceholderDefs } from './snippet-placeholder.util';

/** 快照里记录的内容字段（回滚时覆盖回片段的也就是这些） */
export interface SnippetSnapshotInput {
  name: string;
  description: string | null;
  language: string;
  content: string;
  displayAttrs: Record<string, unknown>;
}

/**
 * 片段版本服务。
 *
 * ## 设计：整快照，而非增量 diff
 * 每次创建 / 更新写入一条**完整快照**。回滚只需把快照覆盖回片段，不必重放历史 ——
 * 这是版本功能里最简单也最不容易出错的做法。代价是存储，但片段正文很小，可接受。
 *
 * ## 快照包含什么 / 不包含什么
 * 包含：`name` / `description` / `language` / `content` / `displayAttrs`（即「正文」）。
 * **不包含**：`collectionId` / `isPublic` / `favorite` / 标签 / 使用统计。
 * 因此**回滚只恢复正文**，不会把片段挪回旧集合、也不会改变公开状态 ——
 * 这是刻意的：那些是「组织方式」，不是「内容」，回滚内容不该顺带改它们。
 *
 * ## 松散之处（沿用既有表结构，未擅自收紧）
 * `snippet_versions` 与片段之间**没有外键**，只有普通索引。因此片段删除后
 * 版本记录会残留。本服务在每次读写前都会先确认片段存在（由调用方的
 * `ensureSnippetOwned` 保证），从而避免把残留记录暴露给用户。
 */
@Injectable()
export class SnippetVersionService {
  constructor(
    @InjectRepository(SnippetVersion)
    private readonly versionRepo: Repository<SnippetVersion>,
    @InjectRepository(KnowledgeSnippet)
    private readonly snippetRepo: Repository<KnowledgeSnippet>,
  ) {}

  /**
   * 写入一条快照。
   *
   * 传 `manager` 以便与「创建 / 更新片段」处于**同一事务** ——
   * 片段写成功但快照失败（或反之）都会让版本历史与正文不一致。
   */
  async writeSnapshot(
    manager: EntityManager,
    snippet: SnippetSnapshotInput & { id: string },
    authorId: string | null,
    message: string,
  ): Promise<void> {
    await manager.getRepository(SnippetVersion).insert({
      id: generateId(),
      snippetId: snippet.id,
      authorId,
      name: snippet.name,
      description: snippet.description,
      language: snippet.language,
      content: snippet.content,
      displayAttrs: snippet.displayAttrs as never,
      message: message.slice(0, 32),
    });
  }

  /** 版本列表（按时间倒序，分页） */
  async listVersions(snippetId: string, page = 1, pageSize = 30) {
    const p = clampPage(page);
    const size = clampPageSize(pageSize, 30);

    const [items, total] = await this.versionRepo.findAndCount({
      where: { snippetId },
      order: { createdAt: 'DESC' },
      skip: (p - 1) * size,
      take: size,
    });

    return {
      items: items.map((v) => this.mapVersion(v)),
      total,
      page: p,
      pageSize: size,
    };
  }

  /** 单个版本详情（含正文，供 diff 使用） */
  async getVersion(snippetId: string, versionId: string) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, snippetId } });
    if (!version) {
      throw new NotFoundException('版本不存在。');
    }
    return this.mapVersion(version, true);
  }

  async deleteVersion(snippetId: string, versionId: string) {
    const result = await this.versionRepo.delete({ id: versionId, snippetId });
    if (!result.affected) {
      throw new NotFoundException('版本不存在。');
    }
    return { ok: true, deleted: 1 };
  }

  /**
   * 回滚：把指定版本的正文覆盖回片段，**并写入一条新快照**记录这次回滚。
   *
   * 为什么要写新快照而不是「原地回退」：版本历史必须是**只追加**的。
   * 若原地回退，回滚前的那个版本就消失了，用户无法「撤销这次回滚」。
   * 追加式记录让回滚本身也可被回滚。
   */
  async rollback(userId: string, snippetId: string, versionId: string) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, snippetId } });
    if (!version) {
      throw new NotFoundException('版本不存在。');
    }

    const snippet = await this.snippetRepo.findOne({ where: { id: snippetId } });
    if (!snippet) {
      throw new NotFoundException('代码片段不存在。');
    }

    await this.snippetRepo.manager.transaction(async (manager) => {
      const restoredContent = version.content ?? '';
      const restored = {
        name: version.name,
        description: version.description,
        language: version.language,
        content: restoredContent,
        displayAttrs: version.displayAttrs ?? {},
      };

      await manager.getRepository(KnowledgeSnippet).update(
        { id: snippetId },
        {
          ...restored,
          // `placeholderDefs` 是 content 的**派生数据**（由 [[名称]] 语法解析而来）。
          // 快照里不存它，因此回滚必须重算 —— 否则正文已回到旧版、
          // 而占位符列表仍是新版解析结果，两者互相矛盾。
          placeholderDefs: extractSnippetPlaceholderDefs(restoredContent),
        } as never,
      );

      await this.writeSnapshot(
        manager,
        { id: snippetId, ...restored },
        userId,
        // 记录「回滚到了哪个版本」，便于在历史里追溯
        `rollback:${versionId}`,
      );
    });

    return { ok: true, restoredFrom: versionId };
  }

  /** 列表项默认不带正文（省流量）；`withContent` 用于详情与 diff */
  private mapVersion(version: SnippetVersion, withContent = false) {
    const base = {
      id: version.id,
      snippetId: version.snippetId,
      name: version.name,
      description: version.description,
      language: version.language,
      message: version.message,
      createdAt: version.createdAt,
    };
    if (!withContent) return base;
    return { ...base, content: version.content ?? '', displayAttrs: version.displayAttrs ?? {} };
  }
}
