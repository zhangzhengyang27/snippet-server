/**
 * 解析「最全 JS 手写题」源 markdown，转换为结构化 JSON，供代码质量审查使用。
 *
 * 输出：server/scripts/js-handwritten-parsed.json
 * 结构：每个 md 文件 → 一个根分类（JS 手写题 / 设计模式）；
 *       标题按层级构建集合树；代码块（```lang ... ```）挂到当前最深标题下。
 *
 * 运行：cd server && npx ts-node -r reflect-metadata scripts/parse-handwritten.ts
 */
import * as fs from 'fs'
import * as path from 'path'

interface CodeBlock {
  language: string
  code: string
}

interface CollectionNode {
  name: string
  level: number
  prose: string
  codeBlocks: CodeBlock[]
  children: CollectionNode[]
}

interface Category {
  name: string
  sourceFile: string
  root: CollectionNode
}

const SRC_DIR = '/Users/xiaoye/Desktop/待处理的项目/最全js手写题'
const FILES: Array<{ file: string; name: string }> = [
  { file: 'js手写题.md', name: 'JS 手写题' },
  { file: '设计模式实现.md', name: '设计模式' },
]

function parseMarkdown(name: string, sourceFile: string, text: string): Category {
  const root: CollectionNode = {
    name,
    level: 1,
    prose: '',
    codeBlocks: [],
    children: [],
  }

  // 标题层级栈：level -> 节点
  const stack: Map<number, CollectionNode> = new Map()
  stack.set(1, root)

  let current: CollectionNode = root
  let inCode = false
  let codeLang = ''
  let codeBuf: string[] = []

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const fenceMatch = /^```(\w*)\s*$/.exec(line)
    if (fenceMatch) {
      if (!inCode) {
        inCode = true
        codeLang = fenceMatch[1] || 'text'
        codeBuf = []
      } else {
        // 关闭代码块
        current.codeBlocks.push({ language: codeLang, code: codeBuf.join('\n') })
        inCode = false
        codeLang = ''
        codeBuf = []
      }
      continue
    }

    if (inCode) {
      codeBuf.push(line)
      continue
    }

    const headingMatch = /^(#{2,6})\s+(.*)$/.exec(line)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      const node: CollectionNode = {
        name: title,
        level,
        prose: '',
        codeBlocks: [],
        children: [],
      }
      // 找最近的上层节点
      let parent: CollectionNode | undefined
      for (let l = level - 1; l >= 1; l--) {
        if (stack.has(l)) {
          parent = stack.get(l)
          break
        }
      }
      parent = parent ?? root
      parent.children.push(node)
      stack.set(level, node)
      // 清掉更深层级的栈（防止错位）
      for (const l of [...stack.keys()]) {
        if (l > level) stack.delete(l)
      }
      current = node
      continue
    }

    // 普通文本：归入当前节点 prose
    const trimmed = line.trim()
    if (trimmed) {
      current.prose += (current.prose ? '\n' : '') + line
    }
  }

  return { name, sourceFile, root }
}

function main() {
  const categories: Category[] = []
  for (const { file, name } of FILES) {
    const full = path.join(SRC_DIR, file)
    const text = fs.readFileSync(full, 'utf-8')
    categories.push(parseMarkdown(name, file, text))
  }

  const outPath = path.join(__dirname, 'js-handwritten-parsed.json')
  fs.writeFileSync(outPath, JSON.stringify(categories, null, 2), 'utf-8')

  // 概要统计
  const countNodes = (node: CollectionNode): number =>
    1 + node.children.reduce((s, c) => s + countNodes(c), 0)
  const countBlocks = (node: CollectionNode): number =>
    node.codeBlocks.length + node.children.reduce((s, c) => s + countBlocks(c), 0)
  for (const cat of categories) {
    console.log(
      `├─ ${cat.name} (${cat.sourceFile}): 集合节点 ${countNodes(cat.root) - 1}, 代码块 ${countBlocks(cat.root)}`,
    )
  }
  console.log(`\n✅ 已写入 ${outPath}`)
}

main()
