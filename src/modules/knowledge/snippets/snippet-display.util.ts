import type { SnippetDisplayAttrs, SnippetFile, SnippetTheme } from './snippet-types'

const THEME_SET = new Set<SnippetTheme>(['one-dark-pro', 'github-light', 'slate'])

const normalizeFiles = (value: unknown): SnippetFile[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const files = value
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      name: typeof f.name === 'string' ? f.name : 'unnamed',
      language: typeof f.language === 'string' ? f.language : 'text',
      code: typeof f.code === 'string' ? f.code : '',
    }))
  return files.length > 0 ? files : undefined
}

export const snippetDisplayDefaults: SnippetDisplayAttrs = {
  language: 'javascript',
  title: null,
  theme: 'one-dark-pro',
  lineNumbers: true,
  wrap: false,
  collapsed: false,
}

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

export const normalizeSnippetDisplayAttrs = (
  input?: Partial<SnippetDisplayAttrs> | Record<string, unknown> | null,
): SnippetDisplayAttrs => {
  const themeCandidate =
    typeof input?.theme === 'string' && THEME_SET.has(input.theme as SnippetTheme)
      ? (input.theme as SnippetTheme)
      : snippetDisplayDefaults.theme
  const titleCandidate = typeof input?.title === 'string' ? input.title.trim() : ''

  return {
    language: normalizeText(input?.language) || snippetDisplayDefaults.language,
    title: titleCandidate ? titleCandidate : null,
    theme: themeCandidate,
    lineNumbers: normalizeBoolean(input?.lineNumbers, snippetDisplayDefaults.lineNumbers),
    wrap: normalizeBoolean(input?.wrap, snippetDisplayDefaults.wrap),
    collapsed: normalizeBoolean(input?.collapsed, snippetDisplayDefaults.collapsed),
    files: normalizeFiles(input?.files),
  }
}
