export type SnippetTheme = 'one-dark-pro' | 'github-light' | 'slate'
export type SnippetPlaceholderKind = 'text' | 'choice'

/** 描述一个多文件片段中的单个文件（用于详情页 tab 切换展示）。 */
export interface SnippetFile {
  /** 文件名（含扩展名），如 index.vue / useUploadImage.ts */
  name: string
  /** 该文件的语言，用于高亮，如 vue / typescript */
  language: string
  /** 文件源码内容 */
  code: string
}

export interface SnippetDisplayAttrs {
  language: string
  title: string | null
  theme: SnippetTheme
  lineNumbers: boolean
  wrap: boolean
  collapsed: boolean
  /** 多文件片段：每个文件作为一个 tab。单文件片段不设置此字段。 */
  files?: SnippetFile[]
}

export interface SnippetPlaceholderDef {
  name: string
  kind: SnippetPlaceholderKind
  defaultValue: string | null
  options: string[]
}
