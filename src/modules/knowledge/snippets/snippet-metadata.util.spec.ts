/**
 * 「语义元数据闸门」回归锁。
 *
 * 重点是 2026-10-07 修掉的那个盲点：原实现用 `description === name` 做严格字符串比对，
 * 只要把标题里的空格换成 `/`、圆括号换成方括号、末尾补个句号，就能带着「零信息量描述」入库。
 * 实测当时全库有此形态 112 条。下面每个用例都对应一种真实出现过的绕过写法。
 */
import {
  SNIPPET_METADATA_RULES,
  checkSnippetMetadata,
  normalizeSnippetMetadataText,
  partitionByMetadata,
} from './snippet-metadata.util'

const codesOf = (input: { name?: string; description?: string }) =>
  checkSnippetMetadata(input).map(issue => issue.code)

/** 一条内容合格、只在标点上做手脚的样本，用于验证「归一化后才比对」。 */
const PINIA_NAME = 'stores user.js - Pinia 状态管理'

describe('normalizeSnippetMetadataText', () => {
  it('忽略大小写、标点、空白与符号', () => {
    expect(normalizeSnippetMetadataText(PINIA_NAME)).toBe(
      normalizeSnippetMetadataText('stores/user.js - Pinia 状态管理。'),
    )
  })

  it('保留中英文与数字，供语义比对使用', () => {
    expect(normalizeSnippetMetadataText('Vue 3 ref！')).toBe('vue3ref')
    expect(normalizeSnippetMetadataText('读取 /proc/cpuinfo')).toBe('读取proccpuinfo')
  })
})

describe('checkSnippetMetadata — 描述不得复述标题', () => {
  it('原样照抄标题：仍判违规（原有行为的回归锁）', () => {
    expect(codesOf({ name: 'Redis 缓存穿透', description: 'Redis 缓存穿透' })).toContain(
      'DESCRIPTION_EQUALS_NAME',
    )
  })

  it('标题后只加句号：仍判违规', () => {
    expect(codesOf({ name: 'Redis 缓存穿透', description: 'Redis 缓存穿透。' })).toContain(
      'DESCRIPTION_EQUALS_NAME',
    )
  })

  // ↓↓↓ 旧实现漏掉、本次修复的核心场景 ↓↓↓

  it('把空格换成斜杠后照抄：按归一化判为完全相同', () => {
    expect(
      codesOf({ name: PINIA_NAME, description: 'stores/user.js - Pinia 状态管理。' }),
    ).toContain('DESCRIPTION_EQUALS_NAME')
  })

  it('圆括号换成方括号、补全角冒号后照抄：按归一化判为完全相同', () => {
    expect(
      codesOf({
        name: '品牌类型 Branded Type ：给原始类型添加唯一标记',
        description: '品牌类型（Branded Type）：给原始类型添加唯一标记。',
      }),
    ).toContain('DESCRIPTION_EQUALS_NAME')
  })

  it('仅大小写不同：按归一化判为完全相同', () => {
    expect(
      codesOf({ name: 'Web Component 通信', description: 'web component 通信。' }),
    ).toContain('DESCRIPTION_EQUALS_NAME')
  })

  it('标题重复两遍：判为「只是在重复标题」', () => {
    expect(
      codesOf({
        name: '支持 HTTP Range 的文件下载',
        description: '支持 HTTP Range 的文件下载：支持 HTTP Range 的文件下载。',
      }),
    ).toContain('DESCRIPTION_MIRRORS_NAME')
  })

  it('标题 + 几个不含信息的尾巴：判为「只是在重复标题」', () => {
    expect(
      codesOf({ name: 'Redis 键过期与内存管理', description: 'Redis 键过期与内存管理 TTL 设置与查看。' }),
    ).toContain('DESCRIPTION_MIRRORS_NAME')
  })

  it('去掉标题后正好剩 10 字：放行（阈值边界，不留误伤）', () => {
    expect(
      codesOf({
        name: 'Redis 缓存',
        description: 'Redis 缓存穿透与击穿的常用处置方案，布隆过滤器加空值缓存即可。',
      }),
    ).not.toContain('DESCRIPTION_MIRRORS_NAME')
  })

  it('去掉标题后只剩 9 字：拦截（阈值边界）', () => {
    expect(
      codesOf({ name: 'Redis 缓存', description: 'Redis 缓存：穿透与击穿处理方案' }),
    ).toContain('DESCRIPTION_MIRRORS_NAME')
  })

  it('只在句中提到标题、且补充了实质内容：不得误伤', () => {
    expect(
      codesOf({
        name: 'Node 读取大文件',
        description: '用 readline 逐行消费，避免把内容一次性读进内存，也适用于 Node 读取大文件的日志场景。',
      }),
    ).toEqual([])
  })

  it('标题为空时不做复述比对（只报标题为空）', () => {
    expect(codesOf({ name: '', description: '一段与标题无关的说明文字，超过二十个字用于通过长度校验。' })).toEqual([
      'EMPTY_NAME',
    ])
  })
})

describe('checkSnippetMetadata — 其余规则不回归', () => {
  it('合格样本零问题', () => {
    expect(
      codesOf({
        name: 'Redis 缓存穿透',
        description: '用布隆过滤器先拦掉不存在的 key，再对空结果做短 TTL 缓存，避免请求全部落到数据库。',
      }),
    ).toEqual([])
  })

  it('描述过短仍拦，且优先于复述判定', () => {
    const codes = codesOf({ name: 'Redis 缓存', description: 'Redis 缓存。' })
    expect(codes).toContain('DESCRIPTION_TOO_SHORT')
  })

  it('标题超长与语言标签后缀仍拦', () => {
    // 32 字，越过 30 字上限
    expect(
      codesOf({ name: '这是一个明显超过三十个字符上限的标题用来验证长度校验是否仍然生效', description: '合格的描述内容，长度足够并且与标题无关，用于通过校验。' }),
    ).toContain('NAME_TOO_LONG')
    expect(
      codesOf({ name: '数组去重（JavaScript）', description: '合格的描述内容，长度足够并且与标题无关，用于通过校验。' }),
    ).toContain('NAME_TRAILING_LANGUAGE_TAG')
  })

  it('partial 模式：未传字段放行，传空串仍拦', () => {
    expect(checkSnippetMetadata({ name: '只有标题' }, { partial: true })).toEqual([])
    expect(
      checkSnippetMetadata({ name: '只有标题', description: '' }, { partial: true }).map(i => i.code),
    ).toContain('EMPTY_DESCRIPTION')
  })

  it('阈值常量与注释保持一致', () => {
    expect(SNIPPET_METADATA_RULES.descriptionNameResidueMinLength).toBe(10)
  })
})

describe('partitionByMetadata', () => {
  it('按闸门拆分合格与被拦条目', () => {
    const { accepted, rejected } = partitionByMetadata([
      { name: 'A', description: 'A' },
      { name: 'B', description: '描述与标题无关且长度足够的合格内容，用于通过校验。' },
    ])

    expect(accepted.map(item => item.name)).toEqual(['B'])
    expect(rejected.map(entry => entry.item.name)).toEqual(['A'])
    expect(rejected[0].issues.map(issue => issue.code)).toContain('DESCRIPTION_EQUALS_NAME')
  })
})
