import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * 片段版本快照。
 *
 * 每次创建 / 更新片段时写入一条**完整快照**（而非增量 diff）—— 回滚只需把快照
 * 覆盖回片段即可，不必重放历史。这是版本功能里最简单也最不容易出错的做法。
 *
 * ## 为什么列名是 camelCase
 * 该表早于其它知识库实体存在（库中已有真实历史数据），列名沿用原样以便对齐；
 * **不要**为了统一而改名 —— 那会造成一次无意义的 schema 迁移与数据搬迁。
 *
 * ## 已知的松散之处（刻意保留，未擅自收紧）
 * - `snippetId` 是 varchar(36)，而 `ui_knowledge_snippets.id` 是 varchar(12)；
 * - 两表之间**没有外键**，只有一个普通索引 `idx_snippet_versions_snippetId`。
 *   因此片段被删除后，其版本记录会残留（读接口需自行过滤）。
 *   补外键属于 schema 变更，需走迁移并评估存量数据，故未在本轮处理。
 */
@Entity('snippet_versions')
@Index('idx_snippet_versions_snippetId', ['snippetId'])
export class SnippetVersion {
  /**
   * 主键约束名显式指定为 `snippet_versions_pkey`（与库中一致）。
   * 不指定的话 TypeORM 会期望 `PK_<hash>`，与库里的名字不符 —— 那会让每次
   * `migration:generate` 都产出一条「改主键名」的无意义 diff。
   */
  @PrimaryColumn({
    type: 'varchar',
    length: 36,
    primaryKeyConstraintName: 'snippet_versions_pkey',
  })
  id!: string;

  /** 所属片段 id（无外键，见类注释） */
  @Column({ type: 'varchar', length: 36 })
  snippetId!: string;

  /** 触发这次快照的用户；历史数据可能为空 */
  @Column({ type: 'varchar', length: 36, nullable: true })
  authorId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 64 })
  language!: string;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  /** 展示属性（多文件、难度等），与片段的 displayAttrs 同构 */
  @Column({ type: 'jsonb', nullable: true })
  displayAttrs!: Record<string, unknown> | null;

  /** 变更说明：create / update / rollback:<源版本 id> / 用户填写的备注 */
  @Column({ type: 'varchar', length: 32, default: 'auto' })
  message!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;
}
