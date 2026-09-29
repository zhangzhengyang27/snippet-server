import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

/** NanoID 主键在 service 写入时用 generateId() 赋值；default '' 仅为占位避免 NOT NULL 冲突。 */
@Entity('ui_knowledge_snippet_tags')
export class KnowledgeSnippetTag {
  @PrimaryColumn({ type: 'varchar', length: 12, default: () => `''` })
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
