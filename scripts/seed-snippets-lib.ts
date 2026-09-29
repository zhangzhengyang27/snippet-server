/**
 * seed-snippets-lib.ts
 * 将 /Users/xiaoye/Desktop/待处理的项目/snippets 这个前端代码片段库
 * 整理进代码块页面（/snippets）的「前端」集合下，作为公共二级集合。
 *
 * 约定（与前期 JS 手写题一致）：
 * - 集合挂在「前端」下，作为二级集合「snippets 常用代码片段」，片段平铺（无三级）。
 * - 多文件目录（如 useList / uploadImage）合并为一个片段，源码写入 displayAttrs.files，
 *   由前端详情弹窗以 tab 形式切换展示。
 * - 全部为公共片段：userId = NULL, isPublic = true，未登录用户只读可见。
 * - 对发现的 bug 做最小化修正，并在片段描述中标注原问题与改动点。
 *
 * 运行：cd server && npx ts-node -r reflect-metadata -r tsconfig-paths/register scripts/seed-snippets-lib.ts
 * 可重复运行（幂等）。
 */
import { readFileSync } from 'fs'
import { join, basename } from 'path'
import { nanoid } from 'nanoid'
import { DataSource, IsNull } from 'typeorm'
import dataSource from '../data-source'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'

const SOURCE_ROOT = '/Users/xiaoye/Desktop/待处理的项目/snippets'
const COLLECTION_NAME = 'snippets 常用代码片段'

/** 扩展名 → 高亮语言 */
const langOf = (p: string): string => {
  if (p.endsWith('.vue')) return 'vue'
  if (p.endsWith('.ts') && !p.endsWith('.d.ts')) return 'typescript'
  if (p.endsWith('.js')) return 'javascript'
  if (p.endsWith('.css')) return 'css'
  if (p.endsWith('.html')) return 'html'
  return 'text'
}

/** 已知 bug 的最小化修正：key = 相对源根的文件路径，value = [查找, 替换][] */
const FIXES: Record<string, Array<[string, string]>> = {
  'betterScroll/index.vue': [
    ['scroll.value.maxScrollY', 'scroll.maxScrollY'],
  ],
  'useList/index.ts': [
    [
      "if (!exportRequestFn && typeof exportRequestFn !== 'function') {",
      "if (!exportRequestFn || typeof exportRequestFn !== 'function') {",
    ],
  ],
  'dynamicTags/useDynamicTags.ts': [
    ["import { error } from 'console';\n", ''],
    ["error('执行submitFn出错');", "console.error('执行submitFn出错');"],
  ],
  'uploadImage/useUploadImage.ts': [
    ["import { error } from 'console';\n", ''],
    ['error(err);', 'console.error(err);'],
  ],
  'inputNumberRange/index.vue': [
    [
      `    'update:modelValue',
    'changefrom',
    'update:modelValue',
    'changefrom',
    'update:modelValue',
    'changefrom',
    'update:modelValue',
    'changeto'],`,
      `    'update:modelValue',
    'changefrom',
    'changeto'],`,
    ],
  ],
  'utils/swapElements.ts': [
    [
      'if (arr.length < index1 || arr.length < index2) return arr;',
      'if (index1 >= arr.length || index2 >= arr.length) return arr;',
    ],
  ],
  'utils/readablizeBytes.ts': [
    [
      '  return `${(bytes / 1024 ** Math.floor(e)).toFixed(2)} ${s[e]}` ?? 0;',
      '  return `${(bytes / 1024 ** Math.floor(e)).toFixed(2)} ${s[e]}`;',
    ],
  ],
  'fetchUtil/fetch.ts': [
    ["headers.set('content-type', 'form-data/multipart');", "headers.set('content-type', 'multipart/form-data');"],
    [
      'replaceRequestURL = config.baseURL + URLAddress;',
      'replaceRequestURL = config.baseURL + (queryString ? `${URLAddress}?${queryString}` : URLAddress);',
    ],
  ],
  'directive/auth.ts': [
    ["localStorage.getItem('pmn') as unknown as string[]", "JSON.parse(localStorage.getItem('pmn') || '[]')"],
  ],
  'uni-request/index.ts': [
    ["header : Record<'string', 'string'>;", 'header ?: Record<string, string>;'],
    [
      "method ?: 'POST' | 'GET' | 'PUT' | 'GET' | 'CONNECT' | 'HEAD' | 'OPTIONS' | 'TRACE';",
      "method ?: 'POST' | 'GET' | 'PUT' | 'CONNECT' | 'HEAD' | 'OPTIONS' | 'TRACE';",
    ],
  ],
  'utils/formatPast.ts': [
    [
      `console.log(formatPast('2024-1-1 11:11:11')); // 3天前
console.log(formatPast('2023-11-1 11:11:11')); // 2个月前
console.log(formatPast('2015-07-10 21:32:01')); // 8年前
console.log(formatPast('2023-02-01 09:32:01', '-', false)); // 2023-2-1
console.log(formatPast('2023.12.8 19:32:01', '/')); // 2023/12/08
console.log(formatPast('2023.12.8 19:32:01', '.')); // 2023.12.08
console.log(formatPast('2023/5/10 11:32:01', '年月日')); // 2023年05月10日
console.log(formatPast('2023/6/25 11:32:01', '月日', false)); // 6月25日
console.log(formatPast('2023/8/08 11:32:01', '年')); // 2023年`,
      '',
    ],
  ],
}

const applyFixes = (rel: string, code: string): string => {
  const fixes = FIXES[rel]
  if (!fixes) return code
  let out = code
  for (const [from, to] of fixes) {
    if (!out.includes(from)) {
      console.warn(`  ⚠️ 未匹配到修复点（跳过）：${rel}`)
      continue
    }
    out = out.replace(from, to)
  }
  return out
}

interface Unit {
  name: string
  description: string
  tags: string[]
  /** 相对源根的文件路径（多文件数组；单文件长度 1） */
  files: string[]
  /** 作为片段主内容（与列表预览）的文件，必须是 files 之一 */
  main: string
}

const UNITS: Unit[] = [
  {
    name: 'betterScroll 滚动组件',
    description:
      '【关键词】Vue3、better-scroll、滚动容器、上拉加载、下拉刷新。基于 better-scroll 封装的 Vue 滚动容器组件，暴露 disable/enable/refresh 方法与 scroll/scrollToEnd 等事件。\n已修正：原代码 `scroll.value.maxScrollY` 把普通变量误当 ref（scroll 非 ref），改为 `scroll.maxScrollY`，否则启用上拉时会抛错。',
    tags: ['Vue', '组件'],
    files: ['betterScroll/index.vue'],
    main: 'betterScroll/index.vue',
  },
  {
    name: 'canvas 文本换行 wrapText',
    description:
      '【关键词】Canvas、文本换行、原型扩展。给 CanvasRenderingContext2D 扩展 wrapText 方法，按 maxWidth 自动折行绘制文本。',
    tags: ['Canvas', '工具函数'],
    files: ['canvas/wrapText.js'],
    main: 'canvas/wrapText.js',
  },
  {
    name: '权限指令 v-auth / v-auths / v-auth-all',
    description:
      '【关键词】Vue 指令、权限控制。单个/多个（满足一个）/全部满足三种权限验证指令，无权限时移除 DOM。\n已修正：原 `localStorage.getItem(\'pmn\') as unknown as string[]` 直接当数组用，实际是 JSON 字符串，改为 `JSON.parse(localStorage.getItem(\'pmn\') || \'[]\')`，否则 `.some`/`.includes` 会抛错。',
    tags: ['Vue', '指令'],
    files: ['directive/auth.ts'],
    main: 'directive/auth.ts',
  },
  {
    name: '范围输入组件 InputNumberRange',
    description:
      '【关键词】Vue2 选项式、ElementUI、范围输入、精度。基于 ElementUI 封装的起止范围输入组件，自动按精度处理。\n已修正：原 `emits` 数组重复声明 update:modelValue / changefrom（copy-paste 错误），已去重。',
    tags: ['Vue', '组件'],
    files: ['inputNumberRange/index.vue'],
    main: 'inputNumberRange/index.vue',
  },
  {
    name: 'uni-app 请求封装 uni-request',
    description:
      '【关键词】uni-app、请求封装、Promise。uni.request 的封装，统一返回 CommonResponseType。\n已修正：① `header` 类型 `Record<\'string\',\'string\'>` 拼写错误，改为 `Record<string, string>`；② 去重 method 联合类型中重复的 \'GET\'。',
    tags: ['请求封装', 'uni-app'],
    files: ['uni-request/index.ts'],
    main: 'uni-request/index.ts',
  },
  {
    name: '级联标签加载 useLabel',
    description:
      '【关键词】Vue3、组合式函数、级联选择器、数据加载。基于 CascaderOption 的级联标签数据加载 hook，挂载即拉取。',
    tags: ['Vue', '组合式函数'],
    files: ['useLabel/index.ts'],
    main: 'useLabel/index.ts',
  },
  {
    name: '时间差计算 usePassTime',
    description:
      '【关键词】Vue3、组合式函数、相对时间。根据时间戳计算“x年前/天前/分钟前/刚刚”等相对时间。',
    tags: ['Vue', '组合式函数'],
    files: ['usePassTime/index.ts'],
    main: 'usePassTime/index.ts',
  },
  {
    name: '发送验证码倒计时 useSendCode',
    description:
      '【关键词】Vue3、组合式函数、验证码、倒计时。发送验证码按钮 hook，带 60s 倒计时与禁用态。',
    tags: ['Vue', '组合式函数'],
    files: ['useSendCode/index.ts'],
    main: 'useSendCode/index.ts',
  },
  {
    name: '拖拽排序 useSortable',
    description:
      '【关键词】Vue3、组合式函数、拖拽排序、sortablejs。基于 sortablejs 的列表拖拽排序 hook（运行时动态导入）。',
    tags: ['Vue', '组合式函数'],
    files: ['useSortable/index.ts'],
    main: 'useSortable/index.ts',
  },
  {
    name: '美化滚动条 scrollbar',
    description: '【关键词】CSS、滚动条美化、webkit-scrollbar。全局美化 WebKit 滚动条槽与滑块样式。',
    tags: ['CSS'],
    files: ['CSS/scrollbar/scrollbar.css'],
    main: 'CSS/scrollbar/scrollbar.css',
  },
  // ── utils ───────────────────────────────────────────────
  {
    name: '浏览器环境判断 browser',
    description: '【关键词】工具函数、浏览器环境、@vueuse。封装 isClient / isIOS / isFirefox 浏览器环境判断。',
    tags: ['工具函数'],
    files: ['utils/browser.ts'],
    main: 'utils/browser.ts',
  },
  {
    name: '清空对象属性 clearObject',
    description: '【关键词】工具函数、对象。将对象所有属性值重置为指定值（默认 undefined）。',
    tags: ['工具函数'],
    files: ['utils/clearObject.ts'],
    main: 'utils/clearObject.ts',
  },
  {
    name: '时间格式化 formatPast',
    description:
      '【关键词】工具函数、时间格式化、相对时间。格式化时间为“刚刚 / x分钟前 / x年-月-日”等。\n已修正：移除末尾 9 行 `console.log` 测试噪声。',
    tags: ['工具函数'],
    files: ['utils/formatPast.ts'],
    main: 'utils/formatPast.ts',
  },
  {
    name: '生成表单校验规则 genRules',
    description:
      '【关键词】工具函数、async-validator、表单校验、ElementUI。快速生成带默认必填规则的表单校验配置。',
    tags: ['工具函数'],
    files: ['utils/genRules.ts'],
    main: 'utils/genRules.ts',
  },
  {
    name: '文件大小格式化 readablizeBytes',
    description:
      '【关键词】工具函数、文件大小、单位转换。将字节数格式化为 KB/MB/GB 等可读字符串。\n已修正：原 `?? 0` 为死代码（模板字符串恒真），已移除。',
    tags: ['工具函数'],
    files: ['utils/readablizeBytes.ts'],
    main: 'utils/readablizeBytes.ts',
  },
  {
    name: 'RGB 转 Hex rgbToHex',
    description: '【关键词】工具函数、颜色转换、RGB、Hex。RGB 数值转十六进制颜色串。',
    tags: ['工具函数'],
    files: ['utils/rgbToHex.ts'],
    main: 'utils/rgbToHex.ts',
  },
  {
    name: '下载/保存文件 saveFile',
    description: '【关键词】工具函数、文件下载。通过动态 a 标签触发文件下载。',
    tags: ['工具函数'],
    files: ['utils/saveFile.ts'],
    main: 'utils/saveFile.ts',
  },
  {
    name: '前端分页 slicePage',
    description: '【关键词】工具函数、前端分页。对数组做前端分页，返回当前页数据与总页数。',
    tags: ['工具函数'],
    files: ['utils/slicePage.ts'],
    main: 'utils/slicePage.ts',
  },
  {
    name: '本地缓存 Local / Session',
    description: '【关键词】工具函数、localStorage、sessionStorage、缓存。封装 Local/Session 永久/临时缓存（带键前缀）。',
    tags: ['工具函数'],
    files: ['utils/storage.ts'],
    main: 'utils/storage.ts',
  },
  {
    name: '交换数组元素 swapElements',
    description:
      '【关键词】工具函数、数组、交换元素。交换数组中两个下标的元素。\n已修正：越界判断 `arr.length < index` 应为 `index >= arr.length`，否则越界写入会产出 undefined。',
    tags: ['工具函数'],
    files: ['utils/swapElements.ts'],
    main: 'utils/swapElements.ts',
  },
  // ── 多文件目录（合并为一个片段，详情页 tab 切换）─────────────
  {
    name: '动态标签组件 dynamicTags',
    description:
      '【关键词】Vue3、动态标签、ElementUI、el-tag、el-autocomplete。支持搜索/添加/关闭的动态标签组件（含 useDynamicTags hook）。\n已修正：原 `import { error } from \'console\'` 为 Node 专属导入、前端不可用，改为 `console.error`。',
    tags: ['Vue', '组件'],
    files: ['dynamicTags/index.vue', 'dynamicTags/useDynamicTags.ts'],
    main: 'dynamicTags/index.vue',
  },
  {
    name: 'fetch 请求封装 fetchUtil',
    description:
      '【关键词】TypeScript、fetch 封装、拦截器、请求库。基于 fetch 的二次封装，支持 baseURL / params 序列化 / 拦截器（request.ts 为带 token 的业务示例模板）。\n已修正：① 文件上传 MIME 误写为 `form-data/multipart`，改为 `multipart/form-data`；② 设置 baseURL 时丢失 query 参数，已拼接保留。',
    tags: ['请求封装'],
    files: ['fetchUtil/fetch.ts', 'fetchUtil/request.ts'],
    main: 'fetchUtil/fetch.ts',
  },
  {
    name: '消息提示封装 message',
    description: '【关键词】消息提示、ElementUI、ant-design、ElMessage。封装成功/警告/错误/信息提示（含 antd 版本 antd.ts）。',
    tags: ['消息提示'],
    files: ['message/index.ts', 'message/antd.ts'],
    main: 'message/index.ts',
  },
  {
    name: '图片上传组件 uploadImage',
    description:
      '【关键词】Vue3、图片上传、ElementUI、上传组件。基于 ElementUI Upload 封装的图片上传组件（含 useUploadImage hook 与 uploadFn 请求函数）。\n已修正：原 `import { error } from \'console\'` 改为 `console.error`。',
    tags: ['Vue', '组件'],
    files: ['uploadImage/uploadImage.vue', 'uploadImage/uploadFn.ts', 'uploadImage/useUploadImage.ts'],
    main: 'uploadImage/uploadImage.vue',
  },
  {
    name: '列表数据 hooks useList',
    description:
      '【关键词】Vue3、列表 hooks、分页、组合式函数。快速渲染列表数据的 hook（含类型定义 types.ts 与示例 other.ts，示例依赖本地 data.json）。\n已修正：`exportRequestFn` 判空逻辑 `!x && typeof !== \'function\'` 应为 `||`，否则传入非函数时不报错。',
    tags: ['Vue', '组合式函数'],
    files: ['useList/index.ts', 'useList/other.ts', 'useList/types.ts'],
    main: 'useList/index.ts',
  },
  {
    name: '富文本编辑器组件 wangeditor',
    description: '【关键词】Vue3、富文本编辑器、wangeditor、组件。基于 wangeditor 封装的富文本编辑器组件（含工具栏配置 toolbar.ts）。',
    tags: ['Vue', '组件'],
    files: ['wangeditor/index.vue', 'wangeditor/toolbar.ts'],
    main: 'wangeditor/index.vue',
  },
]

async function upsertCollection(
  name: string,
  parentId: string | null,
  order: number,
): Promise<SnippetCollection> {
  const repo = dataSource.getRepository(SnippetCollection)
  const existing = await repo.findOne({
    where: { name, parentId: parentId ? parentId : IsNull(), isPublic: true, userId: IsNull() },
  })
  if (existing) {
    return existing
  }
  const coll = repo.create({
    id: nanoid(12),
    userId: null,
    parentId,
    isPublic: true,
    name,
    order,
  })
  await repo.save(coll)
  return coll
}

async function upsertSnippet(
  collectionId: string,
  unit: Unit,
): Promise<KnowledgeSnippet> {
  const repo = dataSource.getRepository(KnowledgeSnippet)
  const mainRel = unit.main
  const mainCode = applyFixes(mainRel, readFileSync(join(SOURCE_ROOT, mainRel), 'utf-8'))
  const mainLang = langOf(mainRel)

  const displayAttrs: Record<string, unknown> = {
    language: mainLang,
    theme: 'one-dark-pro',
    lineNumbers: true,
    wrap: false,
    collapsed: false,
  }
  if (unit.files.length > 1) {
    displayAttrs.files = unit.files.map((f) => ({
      name: basename(f),
      language: langOf(f),
      code: applyFixes(f, readFileSync(join(SOURCE_ROOT, f), 'utf-8')),
    }))
  }

  const existing = await repo.findOne({
    where: { name: unit.name, collectionId, isPublic: true, userId: IsNull() },
  })
  if (existing) {
    existing.language = mainLang
    existing.content = mainCode
    existing.description = unit.description
    existing.displayAttrs = displayAttrs
    existing.placeholderDefs = []
    await repo.save(existing)
    return existing
  }
  const snip = repo.create({
    id: nanoid(12),
    userId: null,
    collectionId,
    isPublic: true,
    name: unit.name,
    description: unit.description,
    language: mainLang,
    content: mainCode,
    displayAttrs,
    placeholderDefs: [],
    favorite: false,
    usageCount: 0,
  })
  await repo.save(snip)
  return snip
}

async function main() {
  await dataSource.initialize()
  const collRepo = dataSource.getRepository(SnippetCollection)

  // 定位「前端」一级集合
  const front = await collRepo.findOne({
    where: { name: '前端', parentId: IsNull(), isPublic: true },
  })
  if (!front) {
    throw new Error('未找到「前端」一级集合，请确认代码块页面集合结构。')
  }

  // 二级集合（幂等）
  const collection = await upsertCollection(COLLECTION_NAME, front.id, 100)
  console.log(`\n📁 二级集合：${COLLECTION_NAME} (id=${collection.id})`)

  let snippetCount = 0
  let multiCount = 0
  for (const unit of UNITS) {
    const snip = await upsertSnippet(collection.id, unit)
    snippetCount++
    if (unit.files.length > 1) multiCount++
    const mark = unit.files.length > 1 ? `（多文件 ${unit.files.length}）` : ''
    console.log(`  ├─ 片段：${unit.name}${mark}`)
  }

  console.log(
    `\n✅ 完成：二级集合 1 个，片段 ${snippetCount} 个（其中多文件合并片段 ${multiCount} 个），全部 isPublic=true / userId=null`,
  )
}

main()
  .then(() => dataSource.destroy())
  .catch(async (e) => {
    console.error('❌ 导入失败：', e)
    await dataSource.destroy()
    process.exit(1)
  })
