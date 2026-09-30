/**
 * 片段版本历史 · 端到端校验脚本（需后端已启动）
 *
 * 用法：
 *   node dist/main            # 另开一个终端先起服务
 *   node scripts/verify-snippet-versions.mjs
 *
 * ## 为什么要有这个脚本
 * 版本历史的行为里有几条**只能靠真实请求才能验到**的契约：
 *   1. 快照写入与片段写入**同事务**（创建 1 条 / 每次更新追加 1 条）
 *   2. 列表按时间倒序 + 分页 + 列表项**不带正文**（省流量），详情才带
 *   3. 回滚是**追加式**：正文回到旧版，同时新增一条 `rollback:<源版本 id>` 快照，
 *      因此「回滚」这个动作本身也能被再回滚
 *   4. `placeholderDefs` 是 content 的派生数据，回滚必须一并重算，
 *      否则正文已回到旧版而占位符列表仍是新版解析结果
 *   5. 越权 / 匿名 / 片段删除后的残留记录，都不能把数据透出去
 *
 * 脚本会自建一个临时片段、并在结束时删除它。注意有两个**刻意保留**的痕迹：
 *   - `snippet_versions` 里会留下本次的孤儿快照（该表与片段之间无外键，属既有设计；
 *     正是因为组件「片段删除后版本接口返回 404」这一条，才不能提前删快照）；
 *   - 清理它们需要直连数据库，脚本本身不做（避免让校验脚本持有写库能力）。
 */
const BASE = process.env.SNIPPET_API ?? 'http://localhost:3000/api';
const USER = process.env.ADMIN_USER ?? 'admin';
const PASS = process.env.ADMIN_PASSWORD ?? 'admin123';

let cookie = '';
const results = [];
const ok = (name, pass, extra = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${extra ? ' :: ' + extra : ''}`);
};

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith('auth-token=')) cookie = c.split(';')[0];
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const V1 = '--[[主题=默认主题]]\nbody { color: red }';
const V2 = 'body { color: blue }';

const login = await req('POST', '/auth/login', { username: USER, password: PASS });
ok('登录', login.status === 200 && !!cookie, `status=${login.status}`);

const created = await req('POST', '/knowledge/snippets', {
  name: '[校验] 版本历史',
  description: 'verify-snippet-versions',
  language: 'css',
  content: V1,
});
const sid = created.body?.id;
ok('创建片段', Boolean(sid), `status=${created.status} id=${sid}`);
ok(
  '创建时正文派生数据已解析（placeholderDefs 1 条）',
  created.body?.placeholderDefs?.length === 1,
  JSON.stringify(created.body?.placeholderDefs),
);

const l1 = await req('GET', `/knowledge/snippets/${sid}/versions`);
const v1Id = l1.body?.items?.[0]?.id;
ok('创建后写入 1 条快照且 message=create', l1.body?.total === 1 && l1.body?.items?.[0]?.message === 'create');
ok('列表项不带正文（省流量）', l1.body?.items?.[0]?.content === undefined);

const d1 = await req('GET', `/knowledge/snippets/${sid}/versions/${v1Id}`);
ok('版本详情带正文且与创建内容一致', d1.body?.content === V1);

await req('PATCH', `/knowledge/snippets/${sid}`, { content: V2 });
const l2 = await req('GET', `/knowledge/snippets/${sid}/versions`);
const v2Id = l2.body?.items?.[0]?.id;
ok(
  '更新后追加快照（total=2，最新 update 在最前）',
  l2.body?.total === 2 && l2.body?.items?.[0]?.message === 'update' && l2.body?.items?.[1]?.id === v1Id,
);

const paged = await req('GET', `/knowledge/snippets/${sid}/versions?page=2&pageSize=1`);
ok('分页可用且 total 不受 pageSize 影响', paged.body?.items?.length === 1 && paged.body?.total === 2);
const clamped = await req('GET', `/knowledge/snippets/${sid}/versions?page=-5&pageSize=0`);
ok('非法分页被钳制', clamped.body?.page === 1 && clamped.body?.pageSize === 30);

const rb = await req('POST', `/knowledge/snippets/${sid}/versions/${v1Id}/rollback`);
ok('回滚返回 ok 与来源版本', rb.body?.ok === true && rb.body?.restoredFrom === v1Id);

const after = await req('GET', `/knowledge/snippets/${sid}`);
ok('回滚后正文回到旧版', after.body?.content === V1);
ok(
  '回滚重算派生数据（placeholderDefs 恢复为 1 条）',
  after.body?.placeholderDefs?.length === 1,
  JSON.stringify(after.body?.placeholderDefs),
);

const l3 = await req('GET', `/knowledge/snippets/${sid}/versions`);
ok(
  '回滚是追加式：total=3 且最新 message=rollback:<来源 id>',
  l3.body?.total === 3 &&
    l3.body?.items?.[0]?.message === `rollback:${v1Id}` &&
    l3.body?.items?.some((i) => i.id === v2Id),
);

ok('删除版本', (await req('DELETE', `/knowledge/snippets/${sid}/versions/${v2Id}`)).body?.deleted === 1);
ok('重复删除 → 404', (await req('DELETE', `/knowledge/snippets/${sid}/versions/${v2Id}`)).status === 404);
ok('取不存在版本 → 404', (await req('GET', `/knowledge/snippets/${sid}/versions/notexist0000`)).status === 404);
ok('回滚不存在版本 → 404', (await req('POST', `/knowledge/snippets/${sid}/versions/notexist0000/rollback`)).status === 404);
ok('访问他人 / 不存在片段 → 404', (await req('GET', '/knowledge/snippets/zzzzzzzzzzzz/versions')).status === 404);

const authed = cookie;
cookie = '';
ok('匿名访问版本接口 → 401', (await req('GET', `/knowledge/snippets/${sid}/versions`)).status === 401);
cookie = authed;

await req('DELETE', `/knowledge/snippets/${sid}`);
ok(
  '片段删除后其版本接口 → 404（孤儿记录不外露）',
  (await req('GET', `/knowledge/snippets/${sid}/versions`)).status === 404,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
if (failed.length) console.log('失败项：' + failed.map((f) => f.name).join(' | '));
console.log(`（本次临时片段 id = ${sid}，已删除）`);
process.exit(failed.length ? 1 : 0);
