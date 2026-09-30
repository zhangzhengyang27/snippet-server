import {
  Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany,
} from 'typeorm';
import { KnowledgeSnippetTagLink } from './knowledge-snippet-tag-link.entity';

/**
 * 片段标签。
 *
 * 唯一性约束建在 (user_id, name) 复合列上，而非 name 单列：标签按 userId 隔离
 * （`syncSnippetTags` 先按 `{ userId, name }` 查，没有才建）。旧实现把唯一索引
 * 建在 name 单列上，导致用户 B 创建与用户 A 同名的标签时撞唯一约束返回 500。
 *
 * 索引名显式指定，与 scripts/fix-tag-unique-index.sql 保持一致。
 *
 * ⚠️ 与库的未对齐项（2026-09-30 实测发现）：
 * 下面的 `userId` 声明为 `nullable: true`，但**库中该列实际是 NOT NULL**。
 * 且 `syncSnippetTags` 的 userId 形参类型就是 `string`，所有调用点都来自已认证
 * 请求 —— 「user_id IS NULL 的公共标签」这条路径在当前代码里并不存在。
 * 二者需要择一对齐（改实体或改库），属产品决策，暂未擅自改动。
 */
@Entity('ui_knowledge_snippet_tags')
@Index('uq_knowledge_snippet_tags_user_name', ['userId', 'name'], { unique: true })
export class KnowledgeSnippetTag {
  /** NanoID 主键在 service 写入时用 generateId() 赋值；default '' 仅为占位避免 NOT NULL 冲突。 */
  @PrimaryColumn({ type: 'varchar', length: 12, default: () => `''` })
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  /** 标签归属用户（库中为 NOT NULL，见类注释的未对齐项） */
  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => KnowledgeSnippetTagLink, (link) => link.tag)
  snippets!: KnowledgeSnippetTagLink[];
}
