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

@Entity('ui_snippet_collections')
export class SnippetCollection {
  @PrimaryColumn({ type: 'varchar', length: 12 })
  id!: string

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null

  @Index()
  @Column({ name: 'parent_id', type: 'varchar', length: 12, nullable: true })
  parentId!: string | null

  /** 是否为公共集合：公共集合不归属用户（userId 为 NULL），对未登录用户只读可见 */
  @Index()
  @Column({ name: 'is_public', default: false })
  isPublic!: boolean

  @Column({ type: 'varchar', length: 120 })
  name!: string

  @Column({ name: 'sort_order', default: 0 })
  order!: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null

  @ManyToOne(() => SnippetCollection, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: SnippetCollection | null

  @OneToMany(() => SnippetCollection, collection => collection.parent)
  children!: SnippetCollection[]
}
