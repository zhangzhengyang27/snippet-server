/**
 * 片段「语义元数据」闸门 —— 标题 / 描述的质量校验。
 *
 * 背景：2026-10 清洗 `ui_knowledge_snippets` 时发现病灶是「标题、描述由导入脚本从代码
 * 注释首行机械截取」，导致三类脏数据回库：
 *   ① 描述 == 标题（零信息量，1413 条）
 *   ② 描述只有几个字（空壳，如 `.card 样式。`，161 条）
 *   ③ 标题 >30 字（「主题词 + 一串补充」被截断后再贴语言标签，734 条）
 *
 * 清洗只改历史数据，挡不住新数据再进来。本文件把「什么叫合格标题/描述」变成可执行规则，
 * 供三条直写库脚本（seed-js-handwritten / import-public-snippets / import-js-advanced-snippets）
 * 与 HTTP 层 DTO 共用，脏数据在写库前就被拦下。
 *
 * 规则与历史清洗口径一致：
 *   标题   非空、≤30 字、不得由语言标识开头（javascript / python / ... 这类机械截取残留）
 *   描述   非空、≥20 字、且与标题不同（也不得是「标题 + 一个句号」）
 *
 * `partial` 模式供 PATCH 场景使用：只校验调用方实际传入的字段，避免「只改 title、顺带被要求补描述」。
 */

export const SNIPPET_METADATA_RULES = {
  nameMaxLength: 30,
  descriptionMinLength: 20,
  descriptionMaxLength: 400,
  /**
   * 语言标识词，用于识别「标题尾部残留的语言标签」（如 `xxx（JavaScript）`）。
   *
   * 只判**尾部**、不判**开头**：像 `PostgreSQL 读写分离连接池`、`Java 虚拟线程与结构化并发`
   * 这种标题里带语言名是正常的技术主题词（全库 160 条都是这类，误判会误伤 4.7% 的合格数据）；
   * 而脏数据是「从代码注释首行截断 → 标题被截到 48 字 → 尾部再贴个语言标签」。
   *
   * 名单只放**真正的编程语言/标记语言**，不放 Docker / Terraform / Redis / MySQL 这类
   * 技术栈名词 —— `多阶段构建减小镜像体积（Docker）` 是合法标题，被拦就属于误伤。
   */
  languageTokens: [
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'python',
    'java',
    'kotlin',
    'scala',
    'go',
    'golang',
    'rust',
    'php',
    'dart',
    'swift',
    'csharp',
    'bash',
    'shell',
    'zsh',
    'sh',
    'sql',
    'plsql',
    'css',
    'scss',
    'less',
    'sass',
    'html',
    'htm',
    'vue',
    'svelte',
    'angular',
    'yaml',
    'yml',
    'json',
    'xml',
    'graphql',
    'markdown',
    'md',
    'text',
    'plaintext',
  ],
} as const

const TRAILING_LANGUAGE_TAG_RE = new RegExp(
  `[（(](${SNIPPET_METADATA_RULES.languageTokens.join('|')})[)）]\\s*$`,
  'i',
)

export type SnippetMetadataField = 'name' | 'description'

export interface SnippetMetadataInput {
  name?: string | null
  description?: string | null
}

export interface SnippetMetadataIssue {
  field: SnippetMetadataField
  code:
    | 'EMPTY_NAME'
    | 'NAME_TOO_LONG'
    | 'NAME_TRAILING_LANGUAGE_TAG'
    | 'EMPTY_DESCRIPTION'
    | 'DESCRIPTION_TOO_SHORT'
    | 'DESCRIPTION_TOO_LONG'
    | 'DESCRIPTION_EQUALS_NAME'
  message: string
}

/** 返回所有违规项；空数组代表合格。 */
export const checkSnippetMetadata = (
  input: SnippetMetadataInput,
  options: { partial?: boolean } = {},
): SnippetMetadataIssue[] => {
  const { partial = false } = options
  const issues: SnippetMetadataIssue[] = []
  const hasName = input.name !== undefined && input.name !== null
  const hasDesc = input.description !== undefined && input.description !== null

  const name = hasName ? input.name!.trim() : ''
  const description = hasDesc ? input.description!.trim() : ''

  // 注意：partial 模式下「未传该字段」放行，但「传了空字符串」仍算违规 ——
  // seed / import 脚本常有 `description = item.description || ''` 这种兜底写法，
  // 若把空串当「未提供」放行，闸门就被绕过去了。
  if (hasName) {
    if (!name) {
      issues.push({ field: 'name', code: 'EMPTY_NAME', message: '标题为空' })
    } else if (name.length > SNIPPET_METADATA_RULES.nameMaxLength) {
      issues.push({
        field: 'name',
        code: 'NAME_TOO_LONG',
        message: `标题 ${name.length} 字，超过 ${SNIPPET_METADATA_RULES.nameMaxLength} 字上限（写成短语式，说明挪到描述）`,
      })
    }
    if (TRAILING_LANGUAGE_TAG_RE.test(name)) {
      issues.push({
        field: 'name',
        code: 'NAME_TRAILING_LANGUAGE_TAG',
        message: '标题尾部残留语言标签（如 xxx（JavaScript）），标题别贴语言后缀，语言由列表自动识别',
      })
    }
  } else if (!partial) {
    issues.push({ field: 'name', code: 'EMPTY_NAME', message: '标题为空' })
  }

  if (hasDesc) {
    if (!description) {
      issues.push({
        field: 'description',
        code: 'EMPTY_DESCRIPTION',
        message: '描述为空（必须说明这段代码干什么、用在什么场景）',
      })
    } else if (description.length < SNIPPET_METADATA_RULES.descriptionMinLength) {
      issues.push({
        field: 'description',
        code: 'DESCRIPTION_TOO_SHORT',
        message: `描述只有 ${description.length} 字，至少需要 ${SNIPPET_METADATA_RULES.descriptionMinLength} 字（说清干什么 + 场景/约束）`,
      })
    }
    if (description.length > SNIPPET_METADATA_RULES.descriptionMaxLength) {
      issues.push({
        field: 'description',
        code: 'DESCRIPTION_TOO_LONG',
        message: `描述 ${description.length} 字，超过列上限 ${SNIPPET_METADATA_RULES.descriptionMaxLength} 字`,
      })
    }
    if (name && (description === name || description === `${name}。`)) {
      issues.push({
        field: 'description',
        code: 'DESCRIPTION_EQUALS_NAME',
        message: '描述与标题完全相同（或只多个句号），等于没写',
      })
    }
  } else if (!partial) {
    issues.push({
      field: 'description',
      code: 'EMPTY_DESCRIPTION',
      message: '描述为空（必须说明这段代码干什么、用在什么场景）',
    })
  }

  return issues
}

export class SnippetMetadataError extends Error {
  readonly issues: SnippetMetadataIssue[]

  constructor(input: SnippetMetadataInput, options?: { partial?: boolean }) {
    const issues = checkSnippetMetadata(input, options)
    super(formatIssues(issues))
    this.name = 'SnippetMetadataError'
    this.issues = issues
  }
}

/** 校验不过直接抛 SnippetMetadataError。 */
export const assertSnippetMetadata = (
  input: SnippetMetadataInput,
  options?: { partial?: boolean },
): void => {
  const issues = checkSnippetMetadata(input, options)
  if (issues.length > 0) throw new SnippetMetadataError(input, options)
}

/** 把违规项压成一行文本，供脚本 / 报错信息打印。 */
export const formatIssues = (issues: SnippetMetadataIssue[]): string =>
  issues.map((i) => `[${i.field}] ${i.message}`).join('；')

/**
 * 批量闸门：逐条校验，返回被拦下的条目。
 * 直写库脚本用它「宁可跳过也不写脏数据」，配合 `--check` 可以先预演不落库。
 */
export const partitionByMetadata = <T extends { name?: string | null; description?: string | null }>(
  items: T[],
  options?: { partial?: boolean },
): { accepted: T[]; rejected: Array<{ item: T; issues: SnippetMetadataIssue[] }> } => {
  const accepted: T[] = []
  const rejected: Array<{ item: T; issues: SnippetMetadataIssue[] }> = []
  for (const item of items) {
    const issues = checkSnippetMetadata(item, options)
    if (issues.length > 0) rejected.push({ item, issues })
    else accepted.push(item)
  }
  return { accepted, rejected }
}
