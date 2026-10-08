import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm'
import { User } from '../../auth/entities/user.entity'
import { SnippetCollection } from './snippet-collection.entity'
import { KnowledgeSnippetTagLink } from './knowledge-snippet-tag-link.entity'

/**
 * 片段「从私有走向公共」的流程状态。
 *
 * 与 `isPublic` 的分工必须分清，二者**不能互相推导**：
 * - `isPublic` 是「公共库可见」的**唯一开关**（公共库查询只认它），
 *   因此它保持只增不减的语义：只有审核通过才为 true；
 * - 本字段记录流程状态，用于作者/管理员看到「审核中 / 已发布 / 已拒绝」。
 *
 * - `none`：私有（从未提交，或提交后撤回、发布后下架）
 * - `pending`：已提交，等待管理员审核（此时 isPublic 仍为 false）
 * - `approved`：审核通过（此时 isPublic = true）
 * - `rejected`：审核未通过（isPublic 保持 false，moderationNote 记录原因，作者可改后重交）
 */
export type SnippetModerationStatus = 'none' | 'pending' | 'approved' | 'rejected'

@Entity('ui_knowledge_snippets')
export class KnowledgeSnippet {
  @PrimaryColumn({ type: 'varchar', length: 12 })
  id!: string

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null

  @Index()
  @Column({ name: 'collection_id', type: 'varchar', length: 12, nullable: true })
  collectionId!: string | null

  /**
   * 是否为公共片段：对所有人（含未登录）可见，登录用户可复制到自己的集合。
   *
   * 注意：公共片段同样有归属 —— userId 指向托管账号（admin），不能为 NULL。
   * 只读语义由本字段表达，与归属给谁无关：即使挂在 admin 名下，
   * 公共片段也不出现在任何人的「我的片段」编辑入口里。
   */
  @Index()
  @Column({ name: 'is_public', default: false })
  isPublic!: boolean

  /**
   * 发布审核状态，见 `SnippetModerationStatus`。
   *
   * 存量公共片段（is_public = true 的运营数据）在迁移中被回填为 `approved` ——
   * 它们本来就是已发布状态，不能因为新增流程字段而显示成「未提交」。
   */
  @Index()
  @Column({ name: 'moderation_status', type: 'varchar', length: 16, default: 'none' })
  moderationStatus!: SnippetModerationStatus

  /** 审核备注：拒绝时记录原因，供作者看到「为什么没过」。 */
  @Column({ name: 'moderation_note', type: 'varchar', length: 200, nullable: true })
  moderationNote!: string | null

  /** 最近一次审核动作的时间（通过 / 拒绝）。 */
  @Column({ name: 'moderated_at', type: 'timestamptz', nullable: true })
  moderatedAt!: Date | null

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @Column({ type: 'varchar', length: 400, nullable: true })
  description!: string | null

  @Column({ type: 'varchar', length: 64 })
  language!: string

  @Column({ type: 'text' })
  content!: string

  @Column({ name: 'display_attrs', type: 'jsonb', default: {} })
  displayAttrs!: Record<string, unknown>

  @Column({ name: 'placeholder_defs', type: 'jsonb', default: [] })
  placeholderDefs!: unknown[]

  @Column({ default: false })
  favorite!: boolean

  @Column({ name: 'usage_count', default: 0 })
  usageCount!: number

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null

  @ManyToOne(() => SnippetCollection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'collection_id' })
  collection!: SnippetCollection | null

  @OneToMany(() => KnowledgeSnippetTagLink, link => link.snippet)
  tagLinks!: KnowledgeSnippetTagLink[]
}
