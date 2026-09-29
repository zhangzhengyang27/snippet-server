import type { SnippetPlaceholderDef } from './snippet-types'

/**
 * 片段占位符解析（与前端 utils/snippetPlaceholders.ts 同一口径）：
 *  - [[名称]]            → text 占位符，无默认值
 *  - [[名称=默认值]]      → text 占位符，带默认值
 *  - [[名称|选项A|选项B]]  → choice 占位符，候选项为竖线分隔
 * 名称紧跟 [[ 且内部不允许空白；未闭合的 [[ 不识别。
 */
const PLACEHOLDER_RE = /\[\[([^\[\]|\s=]+)(?:=([^\[\]]*)|(\|[^\[\]]*))?\]\]/g

export function extractSnippetPlaceholderDefs(content: string): SnippetPlaceholderDef[] {
  const defs = new Map<string, SnippetPlaceholderDef>()
  for (const match of (content ?? '').matchAll(PLACEHOLDER_RE)) {
    const name = match[1]
    if (defs.has(name)) continue
    if (match[3] !== undefined) {
      const options = match[3]
        .slice(1)
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
      defs.set(name, {
        name,
        kind: 'choice',
        defaultValue: options[0] ?? null,
        options,
      })
    } else {
      const defaultValue = match[2]?.trim() ?? ''
      defs.set(name, {
        name,
        kind: 'text',
        defaultValue: defaultValue || null,
        options: [],
      })
    }
  }
  return [...defs.values()]
}
