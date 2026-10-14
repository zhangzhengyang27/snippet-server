# snippet-server · 代码片段知识库（后端）

`snippet` 前端（[zhangzhengyang27/snippet](https://github.com/zhangzhengyang27/snippet)）的配套后端服务：
账号与认证、片段与版本、集合树、标签、收藏、发布审核，以及一批数据导入 / 校验脚本。

## 技术栈

NestJS 10 · TypeORM 0.3 · PostgreSQL 16 · JWT（httpOnly cookie）· class-validator · Jest

## 快速开始

```bash
npm install --legacy-peer-deps
cp .env.example .env       # 按需修改数据库连接与密钥
npm run migration:run      # 建表（首次必须执行）
npm run start:dev          # :3000，首次启动自动创建管理员账号
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME` | PostgreSQL 连接参数 |
| `DB_SYNC` | 仅开发期可用；生产请保持关闭，改用迁移 |
| `JWT_SECRET` | 会话签名密钥 |
| `JWT_EXPIRES_IN` | 会话有效期，默认 `7d` |
| `ADMIN_DEFAULT_PASSWORD` | 首次启动创建管理员账号时使用 |
| `PORT` | 服务端口，默认 `3000` |
| `NODE_ENV` | `production` 下启用启动自检 |
| `RATE_LIMIT_STORE` `REDIS_URL` `RATE_LIMIT_PREFIX` | 限流存储；`auto` 表示配置了 Redis 就用 Redis，否则用进程内计数 |
| `TRUST_PROXY` | 部署在 nginx / 网关之后时设为 `loopback` |

> ⚠️ **生产启动自检**：`JWT_SECRET` 缺失、过弱或短于 32 位，或 `ADMIN_DEFAULT_PASSWORD`
> 缺失、使用内置弱口令、短于 12 位时，服务会**直接拒绝启动**。
> 另：`TRUST_PROXY` 未经代理时**不要**开启，否则客户端可伪造 `X-Forwarded-For` 绕过限流。

## 目录结构

```
src/
├─ modules/
│  ├─ auth/        注册 / 登录 / 修改密码 / 守卫（RequireAuthGuard · RolesGuard）
│  ├─ favorites/   收藏
│  └─ knowledge/   片段、集合、标签、版本、发布审核
├─ migrations/     TypeORM 迁移（基线 + 增量）
├─ data-source.ts  数据源（CLI 与运行期共用的唯一来源）
└─ main.ts         启动引导（gzip、全局校验管道、生产自检）
scripts/           导入 / 校验等一次性脚本（不在类型检查范围内）
```

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/auth/register` | 注册（按 IP + 接口维度限流，注册即签发 cookie） |
| `POST` | `/auth/login` | 登录，标识可为**用户名或邮箱**（邮箱大小写不敏感） |
| `PUT` | `/auth/password` | 修改密码 |
| `GET` | `/knowledge/snippets` | 列表：`scope=mine\|public\|all`、`favorite`、分页与筛选 |
| `GET` | `/knowledge/snippets/:id` | 单个片段（含正文） |
| `POST/PATCH/DELETE` | `/knowledge/snippets/:id` | 片段写操作 |
| `POST/DELETE` | `/knowledge/snippets/:id/publication` | 作者提交 / 撤回发布 |
| `GET` | `/knowledge/snippets/moderation/queue` | 管理员审核队列 |
| `POST` | `/knowledge/snippets/:id/moderation` | 管理员通过 / 拒绝 |
| `POST/DELETE` | `/favorites`、`/favorites/:snippetId` | 收藏（幂等，无 GET） |

> 列表接口默认**不返回 `content`**（列表瘦身，配合 gzip）；需要正文时用 `?ids=` 精确取数。

## 权限模型

- 写接口必须归类：管理员专属 → `RequireAuthGuard` + `RolesGuard` + `@Roles('admin')`；
  用户自有数据 → `ensureSnippetOwned`。**不允许只挂 `RequireAuthGuard` 的写接口**。
- 公共片段的 `user_id` 指向**托管账号（非 NULL）**，由迁移 `PublicSnippetRequiresOwner`
  与 CHECK 约束 `ck_knowledge_snippets_public_has_owner` 保证。
  **判断公共片段不要用 `user_id IS NULL`。**
- `is_public` 是「公共库可见」的唯一开关；`moderation_status`
  （`none|pending|approved|rejected`）只表达审核流程，二者不可互相推导。
  已发布片段被修改**内容类字段**时会自动回到 `pending`。

## 迁移

```bash
npm run migration:run       # 执行待应用的迁移
npm run migration:revert    # 回滚最近一次
npm run migration:generate  # ⚠️ 慎用
```

> 🚨 **修改实体后必须补一个迁移**：基线只反映当前实体定义，不会追平既有数据库的漂移，
> 否则全新部署会缺列。
> ⚠️ `migration:generate` 会依据「当前实体 ↔ 现有库」的差异生成 DDL，本库含历史遗留表，
> 可能生成意外的 `DROP`——使用前请逐条审阅产物。

## 测试

```bash
npm test        # jest
npm run lint
npm run build
```

## 数据脚本（`scripts/`）

导入与校验脚本，例如 `import-public-snippets.ts`（导入公共片段）、
`verify-snippet-metadata.ts`（全库元数据校验）、`public-owner.ts`（公共片段托管归属）。
⚠️ 该目录不在 TypeScript 类型检查范围内，改完需手动跑一次验证。

## 关联仓库

- 前端：[zhangzhengyang27/snippet](https://github.com/zhangzhengyang27/snippet)
