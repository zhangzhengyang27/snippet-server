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
--    正确语义是 (user_id, name) 复合唯一。
--
--  ⚠️ 一处需要更正的说法（2026-09-30 实测）
--    本脚本与 entity 的注释此前都写着「公共标签（user_id IS NULL）仍可重名 ——
--    正是期望行为」。**实际上数据库里 user_id 是 NOT NULL**（实体声明
--    nullable: true，与库不一致），而 syncSnippetTags 的 userId 形参类型就是
--    string、所有调用点都来自已认证请求 —— 也就是说**「user_id IS NULL 的公共
--    标签」这条路径在当前代码里不存在**。复合索引依然是对的（按用户隔离），
--    但理由不是 NULL 语义，而是「标签本来就按 user_id 隔离」。
--    entity 的 nullable 与库的 NOT NULL 属未对齐项，见评审报告待决策。
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
--  步骤 2 / 4：清理所有「非规范」的唯一约束 / 唯一索引
-- ---------------------------------------------------------------------------
--  需要清掉两类历史遗留：
--    (a) 建在 name 单列上的旧唯一项 —— 它导致不同用户无法使用同名标签（本次要修的 bug）
--    (b) 列集合同为 {user_id, name} 但名字不是规范名的重复项 —— 与步骤 3 的索引完全重复，
--        只会让每次写入多维护一份
--
--  ⚠️ 两类都可能以「唯一索引」或「唯一约束」两种形态存在：
--    TypeORM 的 @Index({ unique: true }) 建**索引**，@Unique() 建**约束**；
--    而**约束必须先 DROP CONSTRAINT 才能删** —— 直接 DROP INDEX 会报
--    2BP01「cannot drop index ... because constraint ... requires it」。
--    （实测踩到：本库的 UQ_582140... 就是约束形态。）
--
--  索引名/约束名形如 IDX_<hash>、UQ_<hash>，不可硬编码，故按「列集合」精确匹配，
--  不靠名字前缀。同时排除主键，也排除规范名本身。
DO $$
DECLARE
  con RECORD;
  idx RECORD;
BEGIN
  -- (1) 先删约束（约束占用底层索引，必须先删约束）
  FOR con IN
    SELECT c.conname AS name,
           (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint c
    JOIN pg_class     t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ui_knowledge_snippet_tags'
      AND c.contype = 'u'
  LOOP
    IF con.cols = ARRAY['name']
       OR (con.cols = ARRAY['name', 'user_id']
           AND con.name <> 'uq_knowledge_snippet_tags_user_name')
    THEN
      RAISE NOTICE '删除遗留唯一约束: % (%)', con.name, con.cols;
      EXECUTE format('ALTER TABLE ui_knowledge_snippet_tags DROP CONSTRAINT IF EXISTS %I', con.name);
    END IF;
  END LOOP;

  -- (2) 再删索引
  FOR idx IN
    SELECT c.relname AS name,
           (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(x.indkey::int2[]) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) AS cols
    FROM pg_index x
    JOIN pg_class     c ON c.oid = x.indexrelid
    JOIN pg_class     t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname      = 'public'
      AND t.relname      = 'ui_knowledge_snippet_tags'
      AND x.indisunique
      AND x.indisprimary = false
  LOOP
    IF idx.cols = ARRAY['name']
       OR (idx.cols = ARRAY['name', 'user_id']
           AND idx.name <> 'uq_knowledge_snippet_tags_user_name')
    THEN
      RAISE NOTICE '删除遗留唯一索引: % (%)', idx.name, idx.cols;
      EXECUTE format('DROP INDEX IF EXISTS %I', idx.name);
    END IF;
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
--  若仍能看到列集合为 {name} 的唯一索引，说明步骤 2 没有命中，需人工排查；
--  若仍能看到另一条 {user_id, name} 的唯一索引，说明步骤 2b 没有命中。
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
