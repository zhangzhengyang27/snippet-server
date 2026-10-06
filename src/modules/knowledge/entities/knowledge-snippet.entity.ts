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
