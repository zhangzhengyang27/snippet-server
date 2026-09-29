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

  /** 是否为公共片段：公共片段不归属用户（userId 为 NULL），对未登录用户只读可见 */
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
