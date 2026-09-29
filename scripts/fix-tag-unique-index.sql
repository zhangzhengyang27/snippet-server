-- ============================================================================
--  修复片段标签的唯一性约束：name 单列唯一  →  (user_id, name) 复合唯一
-- ============================================================================
--
--  背景
--    ui_knowledge_snippet_tags.name 上原本是「全局唯一」索引，但标签是按
--    user_id 隔离的（见 knowledge-snippets.service.ts 的 syncSnippetTags：
--    先按 { userId, name } 查，没有才建）。于是用户 B 创建与用户 A 同名的
--    标签时会撞唯一约束，接口返回 500。
--
--    正确语义是 (user_id, name) 复合唯一。PostgreSQL 的唯一索引把 NULL 视为
--    互不相同，因此公共标签（user_id IS NULL）仍可重名 —— 正是期望行为。
--
--  为什么必须显式执行本脚本
--    仓库没有 migrations 目录，schema 由 synchronize 维护，而 synchronize 只在
--    process.env.DB_SYNC === 'true' 时生效。当前 DB_SYNC 的实际取值不确定，
--    因此不能依赖改 entity 装饰器去改库 —— 必须显式执行 DDL。
--
--  幂等性
--    本脚本可重复执行：已执行过再跑不会报错、不会产生副作用。
--
--  执行
--    psql -h localhost -p 5432 -U root -d html5_examples -f scripts/fix-tag-unique-index.sql
--    或用任意 PG 客户端打开本文件整体执行。
--
--  回滚
--    DROP INDEX IF EXISTS uq_knowledge_snippet_tags_user_name;
--    CREATE UNIQUE INDEX IF NOT EXISTS <旧索引名> ON ui_knowledge_snippet_tags (name);
-- ============================================================================


-- ---------------------------------------------------------------------------
--  步骤 1 / 4：预检 —— 是否存在 (user_id, name) 重复
-- ---------------------------------------------------------------------------
--  旧索引是 name 全局唯一，所以 (user_id, name) 必然唯一，此处预期返回 0 行。
--  若真返回了行，说明库里有历史脏数据，需要先人工合并这些标签再往下执行，
--  否则步骤 3 建唯一索引会失败（这是刻意的：宁可响亮失败，也不静默跳过）。
SELECT
  user_id,
  name,
  count(*)      AS dup_count,
  array_agg(id) AS tag_ids
FROM ui_knowledge_snippet_tags
GROUP BY user_id, name
HAVING count(*) > 1;


-- ---------------------------------------------------------------------------
--  步骤 2 / 4：删除建在 name 单列上的旧唯一索引
-- ---------------------------------------------------------------------------
--  TypeORM 自动生成的索引名形如 IDX_<hash>，不可硬编码。这里查系统目录精确匹配
--  「唯一、非主键、列集合恰好等于 {name}」的索引 —— 比字符串匹配 indexdef 更稳，
--  且不会误删主键索引，也不会误删已经是复合索引的新索引。
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT c.relname AS indexname
    FROM pg_index x
    JOIN pg_class     c ON c.oid = x.indexrelid
    JOIN pg_class     t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname       = 'public'
      AND t.relname       = 'ui_knowledge_snippet_tags'
      AND x.indisunique
      AND x.indisprimary  = false
      AND (
            SELECT array_agg(a.attname::text ORDER BY a.attname::text)
            FROM unnest(x.indkey::int2[]) AS k(attnum)
            JOIN pg_attribute a
              ON a.attrelid = t.oid AND a.attnum = k.attnum
          ) = ARRAY['name']
  LOOP
    RAISE NOTICE '删除旧唯一索引: %', idx.indexname;
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
--  步骤 3 / 4：创建 (user_id, name) 复合唯一索引
-- ---------------------------------------------------------------------------
--  索引名与 entity 上 @Index('uq_knowledge_snippet_tags_user_name', ...) 保持一致，
--  这样即使将来 DB_SYNC 打开，synchronize 也不会再造一个重复索引。
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_snippet_tags_user_name
  ON ui_knowledge_snippet_tags (user_id, name);


-- ---------------------------------------------------------------------------
--  步骤 4 / 4：验证 —— 列出该表当前的全部唯一索引
-- ---------------------------------------------------------------------------
--  预期只剩两项：
--    ui_knowledge_snippet_tags_pkey         UNIQUE (id)
--    uq_knowledge_snippet_tags_user_name    UNIQUE (user_id, name)
--  若仍能看到列集合为 {name} 的唯一索引，说明步骤 2 没有命中，需人工排查。
SELECT
  c.relname                                             AS index_name,
  pg_get_indexdef(x.indexrelid)                         AS index_def,
  x.indisprimary                                        AS is_primary
FROM pg_index x
JOIN pg_class     c ON c.oid = x.indexrelid
JOIN pg_class     t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname  = 'public'
  AND t.relname  = 'ui_knowledge_snippet_tags'
  AND x.indisunique
ORDER BY x.indisprimary DESC, c.relname;
