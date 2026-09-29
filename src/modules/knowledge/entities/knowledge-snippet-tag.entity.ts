import {
  Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany,
} from 'typeorm';
import { KnowledgeSnippetTagLink } from './knowledge-snippet-tag-link.entity';

/** NanoID 主键在 service 写入时用 generateId() 赋值；default '' 仅为占位避免 NOT NULL 冲突。 */
@Entity('ui_knowledge_snippet_tags')
export class KnowledgeSnippetTag {
  @PrimaryColumn({ type: 'varchar', length: 12, default: () => `''` })
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  name!: string;

  /** 标签归属用户；公共片段的标签 userId 为 NULL */
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
