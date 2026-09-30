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
 * `userId` 为 **NOT NULL**：标签一律归属于创建它的用户。此前实体误声明为
 * `nullable: true`，而库中一直是 NOT NULL —— 已对齐为实体与库一致
 * （`syncSnippetTags` 的 userId 形参类型本就是 `string`，所有调用点都来自
 * 已认证请求，不存在 userId 为空的标签）。
 */
@Entity('ui_knowledge_snippet_tags')
@Index('uq_knowledge_snippet_tags_user_name', ['userId', 'name'], { unique: true })
export class KnowledgeSnippetTag {
  /** NanoID 主键在 service 写入时用 generateId() 赋值；default '' 仅为占位避免 NOT NULL 冲突。 */
  @PrimaryColumn({ type: 'varchar', length: 12, default: () => `''` })
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  /** 标签归属用户（NOT NULL，与库一致） */
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => KnowledgeSnippetTagLink, (link) => link.tag)
  snippets!: KnowledgeSnippetTagLink[];
}
