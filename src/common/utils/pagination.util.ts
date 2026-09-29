/** 分页参数钳制：非法值回退默认，超界取边界。 */
export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE = 100000
export const MAX_PAGE_SIZE = 100

export function clampPage(value: unknown, max = MAX_PAGE): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE
  return Math.min(n, max)
}

export function clampPageSize(value: unknown, def = DEFAULT_PAGE_SIZE, max = MAX_PAGE_SIZE): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(n, max)
}
