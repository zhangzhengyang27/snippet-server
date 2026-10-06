-- ============================================================================
-- 示例库下线 + 收藏改造为「按用户收藏代码块」
--
-- 背景：示例库（examples / chart_examples 及前端 /example 页面）整体移除；
--       favorites 由「收藏示例」改为「收藏知识片段」，且按用户隔离。
--
-- 为什么用直接 SQL 而不是 TypeORM 迁移：
--   本库 `migrations` 表里登记的是原 html5-examples server 的迁移历史
--   （InitialSchema / AddFavorites / CreateChartExamples ...），与当前
--   `src/migrations/*.ts` 三个文件并不对应。此时 `migration:run` 会把
--   那三个文件当成「待执行」而重跑基线 DDL —— 有误伤风险，故不走 CLI。
--
-- 执行前必须先备份（backups/examples-removal-*.sql 已含三张表全量数据）。
-- 本脚本幂等，可重复执行。
-- ============================================================================

BEGIN;

-- 1) 旧 favorites 的外键指向 examples，先删掉它再删 examples
DROP TABLE IF EXISTS favorites;

-- 2) 示例库两张表（数据已备份）
DROP TABLE IF EXISTS examples CASCADE;
DROP TABLE IF EXISTS chart_examples CASCADE;

-- 3) 重建 favorites：按用户收藏代码块
CREATE TABLE IF NOT EXISTS favorites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar(64) NOT NULL,
  snippet_id varchar(12) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_favorites_snippet_id
    FOREIGN KEY (snippet_id) REFERENCES ui_knowledge_snippets (id) ON DELETE CASCADE,
  CONSTRAINT uq_favorites_user_snippet UNIQUE (user_id, snippet_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id    ON favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_snippet_id ON favorites (snippet_id);

COMMIT;
