import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryColumn,
} from 'typeorm'
import { KnowledgeSnippet } from './knowledge-snippet.entity'
import { KnowledgeSnippetTag } from './knowledge-snippet-tag.entity'

@Entity('ui_knowledge_snippet_tag_links')
export class KnowledgeSnippetTagLink {
  @PrimaryColumn({ name: 'snippet_id', type: 'varchar', length: 12 })
  snippetId!: string

  @Index()
  @PrimaryColumn({ name: 'tag_id', type: 'varchar', length: 12 })
  tagId!: string

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'now()' })
  assignedAt!: Date

  @ManyToOne(() => KnowledgeSnippet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'snippet_id' })
  snippet!: KnowledgeSnippet

  @ManyToOne(() => KnowledgeSnippetTag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag!: KnowledgeSnippetTag
}
23:  userId!: string | null
29:  /** 是否为公共片段：公共片段不归属用户（userId 为 NULL），对未登录用户只读可见 */
