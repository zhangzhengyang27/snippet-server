/**
 * nanoid 的 CommonJS 测试桩。
 *
 * 真实 nanoid v5 是 **ESM-only**（内部 `import { webcrypto } from 'node:crypto'`），
 * 而 Jest 默认运行在 CJS 下，require 它会直接抛
 * "Cannot use import statement outside a module"。
 *
 * 单测不关心 ID 的具体取值，只要求「非空 + 长度正确 + 不重复」，
 * 因此用确定性的自增序列顶替 —— 比给整个项目引入 Babel/ESM 支持便宜得多。
 */
let seq = 0;

exports.nanoid = (size = 21) => {
  const raw = `mock${(seq += 1).toString(36)}`;
  return raw.padEnd(size, '0').slice(0, size);
};
