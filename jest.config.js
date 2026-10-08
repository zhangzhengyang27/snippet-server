/**
 * 后端单测配置。
 *
 * 此前本仓库没有任何测试运行器（只有 eslint / tsc），闸门这类「纯函数 + 规则密集」的
 * 模块就一直靠人工跑脚本验证，改动容易失去保护。这里补上 jest + ts-jest：
 * 只收 `src/**\/*.spec.ts`，用 node 环境，与 NestJS 的默认 tsconfig 共用编译选项。
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // nanoid v5 是 ESM-only，Jest 的 CJS 运行时 require 会直接抛
  // "Cannot use import statement outside a module"。用确定性的 CJS 桩替代，
  // 单测不依赖真实 ID 取值（见 src/__mocks__/nanoid.js）。
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/__mocks__/nanoid.js',
  },
  collectCoverageFrom: ['**/*.util.ts'],
}
