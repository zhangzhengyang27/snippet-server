import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { KnowledgeSnippet } from '../../knowledge/entities/knowledge-snippet.entity';

/**
 * 按用户的「代码块收藏」。
 *
 * 与 `knowledge_snippets.favorite` 的区别：那是一列**全局**布尔标记（任何人收藏
 * 都会写进同一列），本表按 `(user_id, snippet_id)` 唯一，收藏与解收藏只影响本人 ——
 * 这也是公共片段（归属托管账号 admin，普通用户无权 PATCH）能够被收藏的前提。
 */
@Entity('favorites')
@Index(['userId', 'snippetId'], { unique: true })
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @Index()
  @Column({ name: 'snippet_id', type: 'varchar', length: 12 })
  snippetId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /**
   * 收藏对象。声明关系（而非只留 snippetId 标量列）是为了让 TypeORM 生成
   * `snippet_id → ui_knowledge_snippets(id) ON DELETE CASCADE` 外键 ——
   * 片段被删除时收藏行随之清理，不留孤儿。
   *
   * 与该表的历史一致：线上库的外键是示例库下线时手工 SQL 加的
   * （`scripts/remove-examples-and-refactor-favorites.sql`），此前实体没声明，
   * 导致 `migration:generate` 会把线上那个外键当成「多余约束」想去掉。
   * 声明后实体与库口径统一。写法对齐 KnowledgeSnippet 的 userId/collection。
   */
  @ManyToOne(() => KnowledgeSnippet, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'snippet_id' })
  snippet!: KnowledgeSnippet;
}
