import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 用户实体。
 *
 * ⚠️ 线上库 `users` 表还存在若干**本实体未声明**的历史漂移列
 * （`phone` / `avatar` / `updated_at`），是原 html5-examples 库沿革遗留的。
 * 按项目约定（见 `src/migrations/1790751735731-Baseline.ts` 头注释）：
 * 基线只反映「当前实体定义」，不追平这些漂移 —— 需要时再单独补迁移，
 * 不要顺手加进实体（否则空库对撞会出现预期外差异）。
 *
 * 本文件新增的 `email` / `display_name` / `last_login_at` 三列是**账号体系**
 * 真正依赖的，已由迁移 `AddUserProfileColumns` 固化（全新库与线上库均已具备）。
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  username!: string;

  @Column({ name: 'password', type: 'varchar', length: 100 })
  password!: string;

  /**
   * 角色。**注册代码必须显式写入 'user'**：
   * 线上库该列的历史默认值是 `'admin'`（见基线注释中的漂移描述），
   * 若依赖库级默认，新注册用户会直接变成管理员。
   */
  @Column({ type: 'varchar', length: 20, default: 'user' })
  role!: string;

  /** 邮箱（可用于登录；注册时唯一）。 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  /** 展示名（可选）。 */
  @Column({ name: 'display_name', type: 'varchar', length: 50, nullable: true })
  displayName!: string | null;

  /** 最近登录时间。 */
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
