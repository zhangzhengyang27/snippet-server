import {
  Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/** NanoID 主键在 service create 时用 generateId() 赋值；default '' 仅为占位避免 NOT NULL 冲突。 */
@Entity('examples')
export class Example {
  @PrimaryColumn({ type: 'varchar', length: 12, default: () => `''` })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 80, default: '通用' })
  category!: string;

  @Index()
  @Column({ name: 'category_slug', type: 'varchar', length: 80, default: 'general' })
  categorySlug!: string;

  @Index()
  @Column({ name: 'topic_slug', type: 'varchar', length: 80, default: 'general' })
  topicSlug!: string;

  @Column({ type: 'jsonb', default: [] })
  tags!: string[];

  @Column({ type: 'varchar', length: 40, default: 'html' })
  language!: string;

  @Column({ name: 'source_file', type: 'varchar', length: 300, nullable: true })
  sourceFile!: string | null;

  @Column({ name: 'source_line', type: 'int', nullable: true })
  sourceLine!: number | null;

  @Column({ name: 'source_group', type: 'varchar', length: 120, nullable: true })
  sourceGroup!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  difficulty!: string | null;

  @Column({ name: 'is_interactive', default: false })
  isInteractive!: boolean;

  @Column({ type: 'text', nullable: true })
  html!: string | null;

  @Column({ type: 'text', nullable: true })
  css!: string | null;

  @Column({ type: 'text', nullable: true })
  js!: string | null;

  @Column({ type: 'jsonb', default: [] })
  snippets!: Array<{ label: string; html?: string; css?: string; js?: string }>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
