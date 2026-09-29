/** pagination.util 的 RED 测试（tsx 直跑，不依赖测试框架）。实现完成后应全绿。 */
import assert from 'node:assert'
import { clampPage, clampPageSize } from '../src/common/utils/pagination.util'

// 默认值
assert.equal(clampPage(undefined), 1, 'clampPage 默认 1')
assert.equal(clampPageSize(undefined), 20, 'clampPageSize 默认 20')
// 非法输入回退
assert.equal(clampPage('abc'), 1, '非数字回退 1')
assert.equal(clampPageSize(-5), 20, '负数回退默认')
assert.equal(clampPage(0), 1, '0 回退 1')
// 边界钳制
assert.equal(clampPage(999999), 100000, 'page 上限 100000')
assert.equal(clampPageSize(500), 100, 'pageSize 上限 100')
// 正常透传
assert.equal(clampPage('3'), 3, '字符串数字解析')
assert.equal(clampPageSize(50), 50, '正常 pageSize 透传')
// 自定义默认
assert.equal(clampPageSize(undefined, 8), 8, '自定义默认 pageSize')

console.log('pagination.util tests: 10/10 PASS')
