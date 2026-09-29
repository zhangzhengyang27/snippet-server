/**
 * ID 生成工具
 * 使用 NanoID 生成 12 字符的短 ID
 */
import { nanoid } from 'nanoid'

/** ID 长度常量 */
export const ID_LENGTH = 12

/**
 * 生成默认 ID（12 字符 NanoID）
 */
export function generateId(): string {
  return nanoid(ID_LENGTH)
}

/**
 * 生成自定义长度的 ID
 */
export function generateCustomId(length: number): string {
  return nanoid(length)
}
