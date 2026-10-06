/**
 * 将「最全 JS 手写题」整理进「代码块」页面（/snippets）的前端公共集合。
 *
 * 实现方式：直接通过 server/src/data-source.ts 写库（无需启动 HTTP Server、无需鉴权）。
 * 写入的集合与片段均为「公共」：userId = NULL, isPublic = true，
 * 因此未登录用户在代码块页面也以只读方式可见 —— 即「前端集合」。
 * 结构：挂在已有的「前端」一级集合下作为二级集合（前端 → JS 手写题 / 设计模式），
 * 每个二级集合下平铺片段列表（不保留「题」三级子集合），对齐代码块页面现有约定。
 *
 * 代码质量：源 markdown 中部分实现存在 bug / 不规范写法，这里在对应片段的
 * content 中给出修正版（见 IMPROVED_* 常量），其余保留原实现并在 description
 * 中标注质量说明与可优化点。
 *
 * 幂等：按 (isPublic, name, parentId) 复用/更新集合与片段，可重复执行。
 *
 * 运行：cd server && npx ts-node -r reflect-metadata -r tsconfig-paths/register scripts/seed-js-handwritten.ts
 */
import fs from 'fs'
import path from 'path'
import dataSource from '../src/data-source'
import { generateId } from '../src/common/utils/id.util'
import { normalizeSnippetDisplayAttrs } from '../src/modules/knowledge/snippets/snippet-display.util'
import { IsNull } from 'typeorm'
import { SnippetCollection } from '../src/modules/knowledge/entities/snippet-collection.entity'
import { KnowledgeSnippet } from '../src/modules/knowledge/entities/knowledge-snippet.entity'
import { resolvePublicOwner } from './public-owner'
import {
  checkSnippetMetadata,
  formatIssues,
} from '../src/modules/knowledge/snippets/snippet-metadata.util'

// ── 修正版代码（仅对确有 bug / 不规范处替换）───────────────────────────────

const IMPROVED_CALL_APPLY_BIND = `// 手写 call
Function.prototype.call = function (context, ...args) {
  // 兜底用 globalThis：兼容严格模式 / ES Module / Node，避免引用 window 报错
  const ctx = context == null ? globalThis : Object(context);
  const fnKey = Symbol('fn'); // 唯一 key，避免覆盖已有属性
  ctx[fnKey] = this;          // this 指向调用 call 的函数
  const result = ctx[fnKey](...args); // 隐式绑定 this 执行
  delete ctx[fnKey];
  return result;
};

// apply 与 call 一致，仅第二个参数为数组
Function.prototype.apply = function (context, args) {
  const ctx = context == null ? globalThis : Object(context);
  const fnKey = Symbol('fn');
  ctx[fnKey] = this;
  const result = ctx[fnKey](...(args || []));
  delete ctx[fnKey];
  return result;
};

// bind：返回绑定 this 的新函数，且能作为构造函数调用
Function.prototype.bind = function (context, ...args) {
  const fn = this;
  if (typeof fn !== 'function') {
    throw new TypeError('bind 必须作用在函数上');
  }
  const bound = function (...args2) {
    // 作为构造函数（new bound）调用时，this 是新实例，忽略绑定的 context
    return fn.apply(this instanceof bound ? this : context, [...args, ...args2]);
  };
  // 维护原型链：箭头函数没有 prototype，需做保护
  if (fn.prototype) {
    bound.prototype = Object.create(fn.prototype);
  }
  return bound;
};`

const IMPROVED_INSTANCE_OF = `function instanceOf(obj, constructor) {
  // 用 Object.getPrototypeOf 遍历原型链，替代已废弃的 __proto__
  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    if (proto === constructor.prototype) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

// 测试
function Dog() {}
const dog = new Dog();
console.log(instanceOf(dog, Dog), instanceOf(dog, Object)); // true true`

const IMPROVED_PARASITIC_INHERIT = `// 寄生组合式继承（正确版）：只继承父类原型，不重复调用父类构造函数
function Parent(name) {
  this.name = name;
}
Parent.prototype.getName = function () {
  console.log(this.name);
};
function Child(name, age) {
  Parent.call(this, name); // 调用父类构造函数，绑定 this
  this.age = age;
}
function createObj(o) {
  function F() {}
  F.prototype = o;
  return new F();
}
Child.prototype = createObj(Parent.prototype); // 等价于 Object.create(Parent.prototype)
Child.prototype.constructor = Child;

const child = new Child('tom', 12);
child.getName(); // tom`

const IMPROVED_PROMISE = `class Promise {
  constructor(executor) {
    this.state = 'pending';
    this.value = undefined;
    this.reason = undefined;
    this.onFulfilled = [];
    this.onRejected = [];
    const resolve = (value) => {
      if (this.state !== 'pending') return;
      this.state = 'fulfilled';
      this.value = value;
      this.onFulfilled.forEach((cb) => cb(value));
    };
    const reject = (reason) => {
      if (this.state !== 'pending') return;
      this.state = 'rejected';
      this.reason = reason;
      this.onRejected.forEach((cb) => cb(reason));
    };
    try {
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
  }

  then(onFulfilled, onRejected) {
    return new Promise((resolve, reject) => {
      const handleFulfilled = (value) => {
        try {
          const res = typeof onFulfilled === 'function' ? onFulfilled(value) : value;
          if (res instanceof Promise) res.then(resolve, reject);
          else resolve(res);
        } catch (e) {
          reject(e);
        }
      };
      const handleRejected = (reason) => {
        try {
          const res = typeof onRejected === 'function' ? onRejected(reason) : reason;
          if (res instanceof Promise) res.then(resolve, reject);
          else resolve(res);
        } catch (e) {
          reject(e);
        }
      };
      // 已 settled：直接调度（保证异步语义），修复原实现“settled 后 then 不触发”的问题
      if (this.state === 'fulfilled') {
        Promise.resolve().then(() => handleFulfilled(this.value));
      } else if (this.state === 'rejected') {
        Promise.resolve().then(() => handleRejected(this.reason));
      } else {
        this.onFulfilled.push(handleFulfilled);
        this.onRejected.push(handleRejected);
      }
    });
  }
}`

const IMPROVED_TEMPLATE_STR = `// 安全的模板字符串实现：接收 context，用 new Function 在受限作用域内求值，避免 eval
function renderTemplate(template, context) {
  var re = new RegExp('\\\\$\\\\{(.*?)\\\\}', 'g');
  return template.replace(re, function (_, expr) {
    var keys = Object.keys(context);
    try {
      var fn = new Function(keys.join(','), 'return (' + expr + ');');
      return fn.apply(null, keys.map(function (k) { return context[k]; }));
    } catch (e) {
      return '';
    }
  });
}

var name = '小明';
var age = 20;
console.log(renderTemplate('我叫\${name}，我的年龄 \${age}', { name: name, age: age })); // 我叫小明，我的年龄20`

const IMPROVED_COMBINE = `class Combine {
  constructor() {
    this.list = [];
  }
  add(fn) {
    this.list.push(fn);
    return this; // 支持链式调用
  }
  execute() {
    for (const item of this.list) {
      item.execute();
    }
  }
}
const comb1 = new Combine();
comb1
  .add({ execute() { console.log(1); } })
  .add({ execute() { console.log(2); } });

const comb2 = new Combine();
comb2
  .add({ execute() { console.log(3); } })
  .add({ execute() { console.log(4); } });

const comb3 = new Combine();
comb3
  .add({ execute() { console.log(5); } })
  .add({ execute() { console.log(6); } });
comb2.add(comb3);

const comb4 = new Combine();
comb4.add(comb1).add(comb2);
comb4.execute();

// 最终打印结果：1 2 3 4 5 6`

const IMPROVED_FACTORY = `class Car {
  constructor(name, color) {
    this.name = name;
    this.color = color;
  }
}
class Bicycle {
  constructor(name, color) {
    this.name = name;
    this.color = color;
  }
}
class Factory {
  static create(type) {
    switch (type) {
      case 'car':
        return new Car('汽车', '白色');
      case 'bicycle':
        return new Bicycle('自行车', '黑色'); // 原实现误返回 Car，已修正
      default:
        console.log('没有该类型');
        return null;
    }
  }
}
const p1 = Factory.create('car');
const p2 = Factory.create('bicycle');
console.log(p1, p1 instanceof Car);     // { name: '汽车', color: '白色' } true
console.log(p2, p2 instanceof Bicycle); // { name: '自行车', color: '黑色' } true`

// ── 质量增强映射 ──────────────────────────────────────────────────────────
// key = '分类:::题名'，value 为按代码块顺序的数组（与解析结果一一对应）。
// 每项可含：title(片段名) / description(质量说明) / improved(替换代码) / tags。
interface EnrichItem {
  title?: string
  description: string
  improved?: string
  tags?: string[]
}
type EnrichMap = Record<string, EnrichItem[]>

const kw = (tags?: string[]) => (tags && tags.length ? '【关键词】' + tags.join('、') + '\n\n' : '')

const ENRICH: EnrichMap = {
  'JS 手写题:::let 实现原理': [
    {
      description:
        kw(['作用域', '闭包', 'let']) +
        '演示用 IIFE（立即执行函数）+ 函数作用域模拟 let 的块级作用域效果：循环变量 i 通过参数传入闭包被“冻结”。逻辑正确，属教学示例；现代开发应直接使用 let/const，无需手写。',
    },
  ],
  'JS 手写题:::手写 call apply bind': [
    {
      title: 'call / apply / bind（修正版）',
      description:
        kw(['this', 'call', 'apply', 'bind', '原型']) +
        '原实现 3 处问题：(1) 用 window 兜底，在严格模式 / ES Module / Node 环境会报错，改为 globalThis；(2) 方法名写成 Bind（大写），与规范不一致，改为 bind；(3) bind 直接 Object.create(fn.prototype)，对箭头函数（fn.prototype 为 undefined）会抛错，且作为构造函数调用时未正确处理 this。此处为修正版：globalThis 兜底、规范命名，bind 采用“构造函数场景忽略绑定 this”的标准实现，并对箭头函数做原型保护。',
      improved: IMPROVED_CALL_APPLY_BIND,
    },
    {
      title: '闭包解决 setTimeout 顺序',
      description:
        kw(['闭包', 'setTimeout', '事件循环']) +
        '经典闭包题：用 IIFE 或 setTimeout 第三参数把每次循环的 i 固化为独立作用域，实现 1s 后依次打印 0~4；再用 1000*i 延迟实现间隔递增。实现正确；现代可用 let 直接替代 IIFE（块级作用域天然解决）。',
    },
    {
      title: 'instanceof 手写（修正版）',
      description:
        kw(['原型链', 'instanceof']) +
        '原实现用已废弃的 obj.__proto__ 遍历原型链。修正版改用 Object.getPrototypeOf 并改为迭代，更规范；在 Object.create(null) 等无原型对象上同样安全。',
      improved: IMPROVED_INSTANCE_OF,
    },
    {
      title: '手写 new',
      description:
        kw(['new', '构造函数']) +
        '手写 new：以 Object.create(fn.prototype) 创建实例，用 apply 绑定 this 执行构造器，并根据返回值类型决定返回（对象/函数返回该值，否则返回实例）。实现正确，符合规范；小建议 typeof res === "function" 一并涵盖可调用对象。',
    },
    {
      title: '寄生组合式继承',
      description:
        kw(['继承', '原型链']) +
        '原代码含“精简版”与“通用版”两段。精简版把 Child.prototype = Object.create(Parent.prototype) 写在构造函数里，每次 new 都重设原型且顺序不对，是反模式；通用版（寄生组合式继承）才正确：在类定义时执行一次，并修复 constructor。此处仅保留正确的通用版。',
      improved: IMPROVED_PARASITIC_INHERIT,
    },
  ],
  'JS 手写题:::手写 Class 类': [
    {
      description:
        kw(['class', '继承', '静态方法']) +
        '用 Object.create + Object.setPrototypeOf 模拟 ES6 class：继承父类原型（实例方法）与静态属性/方法。实现正确；现代项目直接用 class 语法即可，Object.setPrototypeOf 写在函数上会影响引擎优化，仅作原理演示。',
    },
  ],
  'JS 手写题:::手写 promise': [
    {
      description:
        kw(['Promise', '异步', '微任务']) +
        '手写 Promise（简化教学版）。修正点：原实现在 Promise 已 settled 后再调用 then 时，回调不会被触发（回调在 resolve 时才遍历数组，已错过）。修正版在 resolve/reject 时缓存状态与值，并在 then 注册时若已 settled 则立即调度回调。仍保留的局限（非 Promise/A+ 完整）：未对 then 返回值做 thenable 鸭子类型解析、未处理 resolve 接收 Promise 的递归展开、then 回调中抛错已正确转入 reject。',
      improved: IMPROVED_PROMISE,
    },
  ],
  'JS 手写题:::手写 race、all': [
    {
      description:
        kw(['Promise', 'race', 'all']) +
        '手写 Promise.race / Promise.all（作为独立工具函数，不依赖上面的自定义 Promise）。race 取第一个落定的结果（包括率先 reject）；all 等待全部 fulfilled，结果按原顺序填充，任一 reject 则整体 reject。实现正确；真实场景可用原生 Promise.allSettled / Promise.any。',
    },
  ],
  'JS 手写题:::手写 retry': [
    {
      description:
        kw(['重试', 'Promise', '容错']) +
        '失败后按 delay 间隔重试 times 次：fn 返回 Promise，失败进入 catch 递减 times 并重试，耗尽则 reject。逻辑正确；建议用 async/await 改写更易读，time 用 0 表示不再重试语义更清晰。',
    },
  ],
  'JS 手写题:::手写 async、await': [
    {
      title: 'generatorToAsync（async 原理）',
      description:
        kw(['async', 'await', 'generator']) +
        '将 Generator 函数编译为 async 函数：yield 被当作 await，通过递归 step(next/throw) 驱动。实现正确，是理解 async/await 本质是语法糖的关键示例；注意它假设 value 是 Promise 或可 Thenable。',
    },
    {
      title: '深拷贝 deepClone',
      description:
        kw(['深拷贝', 'WeakMap', '循环引用']) +
        '深拷贝：用 WeakMap 记录已拷贝对象，处理循环引用与多属性引用同一对象。实现正确；局限：未处理 Date / RegExp / Map / Set / 函数 / 原型链。生产建议用原生 structuredClone 或 lodash.cloneDeep。',
    },
    {
      title: 'Event Loop 顺序验证',
      description:
        kw(['事件循环', '微任务', '宏任务']) +
        '纯输出验证题：演示微任务（Promise.then）优先于宏任务（setTimeout）执行的顺序。作为验证用例保留，可自行在浏览器/Node 运行观察输出。',
    },
  ],
  'JS 手写题:::async、await 事件轮询执行时机': [
    {
      description:
        kw(['async', '事件循环', '微任务']) +
        '验证 async/await 执行时机：await 之后代码注册为微任务；同步代码先执行，再微任务，最后宏任务。正确演示；输出注释即预期顺序。',
    },
  ],
  'JS 手写题:::setTimeout 模拟实现 setInterval': [
    {
      description:
        kw(['setTimeout', 'setInterval', '定时器']) +
        '用 setTimeout 递归调用模拟 setInterval，返回带 cancel() 的对象。可用；与原生差异在于立即先执行一次（原生首次在 t 后），且 cancel 仅清最后一个定时器。若需与原生一致，可把首次执行也放进 setTimeout 延迟。',
    },
  ],
  'JS 手写题:::setInterval 模拟实现 setTimeout': [
    {
      title: 'setInterval 模拟 setTimeout',
      description:
        kw(['setTimeout', 'setInterval']) +
        '用 setInterval 在首次触发后 clearInterval 模拟 setTimeout。可行；mySetTimeout 与 mySetInterval 互模拟是经典题，注意两者语义差异（重复 vs 单次）。',
    },
    {
      title: '手写 reduce',
      description:
        kw(['reduce', '数组', '稀疏数组']) +
        '手写 Array.reduce：处理稀疏数组（用 i in arr 跳过空位）、无初始值时取首个有效元素为初值。实现规范，优于很多简化版；小建议把 Object.prototype.toString.call(fn) != "[object Function]" 换成 typeof fn !== "function" 更直观。',
    },
    {
      title: '手写 compose',
      description:
        kw(['compose', '函数式', 'Promise']) +
        '函数组合：把一系列（返回 Promise 的）函数串联，前一个结果作为后一个输入。正确；注意 list.shift() 会修改入参数组（副作用），可先克隆 [...list]；且依赖每个函数返回 Promise。',
    },
    {
      title: '手写 flat',
      description:
        kw(['flat', '数组', '递归']) +
        '手写 Array.flat(deep)：递归拍平，深度用 deep-1 递减。正确；deep == 0 用宽松相等无碍，但建议 === 0 更严谨。',
    },
    {
      title: '手写 map',
      description:
        kw(['map', '数组']) +
        '手写 Array.map：处理 this 绑定、稀疏数组、返回等长新数组。规范；Object.prototype.toString.call(fn) 建议换 typeof fn !== "function"。',
    },
    {
      title: '手写 filter',
      description:
        kw(['filter', '数组']) +
        '手写 Array.filter：遍历收集满足条件的元素，支持 thisArg。正确；小问题 let list = new Array() 应写为 [] 更简洁。',
    },
    {
      title: '手写 some',
      description:
        kw(['some', '数组']) +
        '手写 Array.some：遇首个满足条件的元素即返回 true 并中断。正确、简洁。',
    },
  ],
  'JS 手写题:::判断所有数据类型的方法': [
    {
      description:
        kw(['类型判断', 'toString']) +
        '用 Object.prototype.toString.call 返回 [object Type] 并截取类型名。通用且可靠，是判断类型的推荐方式（优于 typeof / instanceof）；覆盖 null / undefined / Date / Set 等。',
    },
  ],
  'JS 手写题:::实现 es6 模板字符串': [
    {
      description:
        kw(['模板字符串', 'eval', '安全']) +
        '原实现用 eval(k) 执行模板内表达式，存在严重安全风险（任意代码执行、CSP 违规、严格模式报错），且依赖外层作用域变量。修正版改为接收 context 对象，用 new Function 在受限作用域内求值，避免全局 eval；仍支持 ${a+1} 这类表达式（此处为避免转义写作 ${name}）。生产环境更推荐编译期模板或现成模板引擎。',
      improved: IMPROVED_TEMPLATE_STR,
    },
  ],
  'JS 手写题:::函数柯里化': [
    {
      description:
        kw(['柯里化', '闭包', '函数式']) +
        '函数柯里化：闭包保存已传参数，直到参数个数等于原函数 fn.length 才执行。正确；注意 fn.length 不含剩余参数/有默认值的参数，复杂签名可用占位符方案扩展。',
    },
  ],
  'JS 手写题:::函数防抖': [
    {
      description:
        kw(['防抖', '闭包', '性能']) +
        '防抖：在停止触发 time 毫秒后才执行；flag=true 时首次立即执行（前置防抖）。实现可用；若需取消待执行，可补充 cancel 方法。回调内 this 通过 fn.apply(this, args) 保留。',
    },
  ],
  'JS 手写题:::函数节流': [
    {
      description:
        kw(['节流', '闭包', '性能']) +
        '节流：固定时间间隔内最多执行一次；flag=true 首次立即执行（前置），之后靠定时器尾随执行。可用；与防抖区别在于“按频率放行”而非“静默期后执行”。注意 flag 为闭包内可变状态，多次调用共享。',
    },
  ],
  'JS 手写题:::render 函数': [
    {
      description:
        kw(['虚拟DOM', 'render']) +
        '把虚拟 DOM（{tag, attrs, children}）渲染为真实 DOM，递归创建节点与属性。正确、清晰；未处理事件绑定/命名空间/文本子节点，可扩展。',
    },
  ],
  'JS 手写题:::dom To JSON': [
    {
      description:
        kw(['虚拟DOM', 'DOM']) +
        '把真实 DOM 转为 JSON 描述的虚拟 DOM：记录 nodeName / nodeType / 属性 / 子节点（元素=对象，文本=字符串）。正确；可作为 VDOM diff 的前置步骤。',
    },
  ],
  'JS 手写题:::图片懒加载': [
    {
      description:
        kw(['懒加载', 'IntersectionObserver', '性能']) +
        '用 IntersectionObserver 监听图片是否进入视口，进入后把 data-src 赋给 src 并停止观察。现代、性能优于监听 scroll；小建议用 querySelectorAll 替代 getElementsByTagName（避免实时集合副作用）。',
    },
  ],
  'JS 手写题:::最大并发数': [
    {
      description:
        kw(['并发控制', 'Promise', '性能']) +
        '并发控制：最多同时 num 个任务，某个完成后补位新任务。num-- / num++ 控制窗口，递归 fn() 补位。逻辑正确；list.shift() 会修改入参；若任务 reject，finally 仍会补位（保证不丢槽位）。',
    },
  ],
  'JS 手写题:::LazyMan': [
    {
      description:
        kw(['LazyMan', '链式调用', '任务队列']) +
        '经典题：用任务队列 + setTimeout 宏任务保证链式 API（sleepFirst / sleep / eat）按注册顺序执行。sleepFirst 插入队首优先执行。实现正确；注意依赖事件循环调度，所有 API 必须先注册再统一 next。',
    },
  ],
  'JS 手写题:::sleep 函数的多种实现': [
    {
      title: 'sleep 的多种实现',
      description:
        kw(['sleep', '异步', '定时器']) +
        '演示 4 种“sleep”：① 忙等阻塞主线程（唯一“真”阻塞，但会冻结 UI，慎用）；② setTimeout；③ Promise；④ async/await。作为原理对比保留；生产用 ④ 即可，① 几乎不要用于主线程。',
    },
    {
      title: '发布订阅模式 EventBus',
      description:
        kw(['发布订阅', 'EventBus', '设计模式']) +
        '（原文归类在 sleep 小节下，实为“发布订阅模式”）手写 EventBus：on / emit / off / once。实现正确；once 用包装函数注册并在首次触发后 off，但 emit 用 forEach 遍历时 off 改数组可能略过后续回调，真实场景建议拷贝快照或在遍历后清理。',
    },
    {
      title: '图片并发加载 limit',
      description:
        kw(['并发控制', '图片加载', 'Promise']) +
        '（原文归类在 sleep 小节下）用 limit 控制图片并发加载数量，全部完成 resolve。逻辑正确；与“最大并发数”思路一致；new Image() 预加载方式合理。',
    },
  ],
  '设计模式:::单例模式': [
    {
      description:
        kw(['设计模式', '单例']) +
        '单例：静态方法 getInstance 缓存唯一实例，二次调用返回同一对象。可用；局限（也是特性）：首次之后的 name 参数被忽略；现代可用模块级变量或 ES2022 私有字段 #instance 实现更安全的单例。',
    },
  ],
  '设计模式:::策略模式': [
    {
      description:
        kw(['设计模式', '策略', '表单校验']) +
        '策略模式：把可互换的算法（校验规则）封装为策略对象，Validator 按规则串联执行。经典表单校验实现；小问题：手机号正则较旧（13x/14x/15x/17x/18x），已不全覆盖新号段；strategyAry.shift() 会修改数组（影响可控）。',
    },
  ],
  '设计模式:::代理模式': [
    {
      description:
        kw(['设计模式', '代理', '预加载']) +
        '代理模式：本体 relImage 与代理 proxyImage 接口一致，代理负责预加载（占位图→真实图替换）。正确演示图片预加载代理；本体/代理接口一致性是关键。',
    },
  ],
  '设计模式:::装饰者模式': [
    {
      description:
        kw(['设计模式', '装饰者', '高阶函数']) +
        '装饰者：通过 Function.prototype.before / after 在原函数前后织入逻辑。原理演示正确；污染 Function.prototype 不推荐，生产应写为高阶函数 withBefore(fn, be)。',
    },
  ],
  '设计模式:::组合模式': [
    {
      description:
        kw(['设计模式', '组合']) +
        '组合模式：用树形结构（Combine 含子 Combine）统一对待叶对象与组合对象，根部 execute() 递归执行。修正点：原代码方法名 excute 为拼写错误，统一改为 execute。',
      improved: IMPROVED_COMBINE,
    },
  ],
  '设计模式:::工厂模式': [
    {
      description:
        kw(['设计模式', '工厂']) +
        '工厂模式：静态 Factory.create(type) 按类型返回不同产品实例。修正点：原实现 case "bicycle" 仍 return new Car(...)（返回了错误的类）；此处补了 Bicycle 类，使 create("bicycle") 返回真正的 Bicycle 实例。',
      improved: IMPROVED_FACTORY,
    },
  ],
  '设计模式:::访问者模式': [
    {
      description:
        kw(['设计模式', '访问者']) +
        '访问者模式：元素 accept(visitor) 把自身交给访问者处理，解耦数据结构与操作（如各科老师分别访问学生成绩）。正确演示；适合结构稳定、操作多变场景。',
    },
  ],
  '设计模式:::发布订阅模式': [
    {
      description:
        kw(['设计模式', '发布订阅', 'EventBus']) +
        '发布订阅（另一版 EventBus）：主题发布、订阅者按类型接收。与 sleep 小节下的 EventBus 思路一致；once 的清理在 forEach 中改数组略有风险，建议遍历前拷贝订阅者列表。',
    },
  ],
  '设计模式:::观察者模式': [
    {
      description:
        kw(['设计模式', '观察者', '响应式']) +
        '观察者模式：用 Object.defineProperty 拦截 data 属性的 get/set，变化时打印（模拟通知）。作为“数据变化→通知”原理演示正确；注意这里只是 console.log，并非真实依赖收集/派发，与 Vue2 响应式核心思想一致但做了最简化。',
    },
  ],
}

// ── 解析结果 ──────────────────────────────────────────────────────────────
const PARSED = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'js-handwritten-parsed.json'), 'utf-8'),
) as Array<{
  name: string
  root: {
    name: string
    children: Array<{
      name: string
      codeBlocks: Array<{ language: string; code: string }>
      children: unknown[]
    }>
  }
}>

const LANG_MAP: Record<string, string> = { js: 'javascript', ts: 'typescript', javascript: 'javascript', typescript: 'typescript' }

async function main() {
  await dataSource.initialize()
  console.log('✅ 数据库连接成功')

  const collRepo = dataSource.getRepository(SnippetCollection)
  const snipRepo = dataSource.getRepository(KnowledgeSnippet)

  // 公共片段统一挂在托管账号下，不再写 NULL 归属
  const publicOwner = await resolvePublicOwner(dataSource)
  console.log(`公共片段托管账号：${publicOwner.username} (${publicOwner.id})`)

  const upsertCollection = async (name: string, parentId: string | null, order: number) => {
    const existing = await collRepo.findOne({
      where: { name, parentId: parentId ? parentId : IsNull(), isPublic: true },
    })
    if (existing) return existing
    const created = collRepo.create({
      id: generateId(),
      userId: null,
      parentId: parentId ?? null,
      name,
      order,
      isPublic: true,
    })
    return collRepo.save(created)
  }

  // 语义闸门：标题/描述不达标的片段直接跳过，绝不写库。
  // 当初 3399 条脏数据就是这么进来的（`description = enrich?.description || ''` 留了空壳），
  // 这里是唯一写入口，必须拦住同类问题复发。
  const metadataIssues: string[] = []

  const upsertSnippet = async (
    collectionId: string,
    name: string,
    language: string,
    content: string,
    description: string,
  ) => {
    const issues = checkSnippetMetadata({ name, description })
    if (issues.length > 0) {
      metadataIssues.push(`${name} → ${formatIssues(issues)}`)
      return null
    }
    const existing = await snipRepo.findOne({ where: { name, collectionId, isPublic: true } })
    const displayAttrs = normalizeSnippetDisplayAttrs({ language })
    if (existing) {
      existing.language = language
      existing.content = content
      existing.description = description
      existing.displayAttrs = displayAttrs as unknown as Record<string, unknown>
      return snipRepo.save(existing) as Promise<KnowledgeSnippet>
    }
    const created = snipRepo.create({
      id: generateId(),
      userId: publicOwner.id,
      collectionId,
      isPublic: true,
      name,
      description,
      language,
      content,
      displayAttrs: displayAttrs as unknown as Record<string, unknown>,
      placeholderDefs: [],
      favorite: false,
      usageCount: 0,
    })
    return snipRepo.save(created)
  }

  let collectionCount = 0
  let snippetCount = 0

  // 「前端」一级集合作为父级（代码块页面约定：前端 → 主题二级集合 → 片段列表）
  let front = await collRepo.findOne({ where: { name: '前端', parentId: IsNull(), isPublic: true } })
  if (!front) {
    front = await upsertCollection('前端', null, 0)
  }

  for (const category of PARSED) {
    // 二级集合（挂在「前端」下）
    const top = await upsertCollection(category.name, front.id, 0)
    collectionCount++
    console.log(`\n📁 二级集合（前端/${category.name}）`)

    // 平铺：把每个「题」的代码块直接作为片段挂到二级集合下（不保留「题」子集合）
    const flatten = (nodes: typeof category.root.children) => {
      return nodes.flatMap((node) => {
        const out: Array<{ node: typeof node }> = []
        if (node.codeBlocks.length > 0) out.push({ node })
        const kids = node.children as typeof category.root.children
        if (kids && kids.length) out.push(...flatten(kids))
        return out
      })
    }
    const leafNodes = flatten(category.root.children)

    for (const { node } of leafNodes) {
      const key = `${category.name}:::${node.name}`
      const enrichList = ENRICH[key] ?? []
      for (let i = 0; i < node.codeBlocks.length; i++) {
        const block = node.codeBlocks[i]
        const enrich = enrichList[i]
        const title = enrich?.title || (node.codeBlocks.length > 1 ? `${node.name} ${i + 1}` : node.name)
        const language = LANG_MAP[block.language] || 'javascript'
        const content = enrich?.improved ?? block.code
        const description = enrich?.description || ''
        const saved = await upsertSnippet(top.id, title, language, content, description)
        if (saved) snippetCount++
        console.log(saved ? `  ├─ 片段：${title}` : `  ├─ 跳过（语义不达标）：${title}`)
      }
    }
  }

  console.log(`\n✅ 完成：新增/更新集合 ${collectionCount} 个，片段 ${snippetCount} 个`)
  if (metadataIssues.length > 0) {
    console.error(`\n⚠️ 语义闸门拦下 ${metadataIssues.length} 条未写入（标题/描述不达标）：`)
    for (const item of metadataIssues.slice(0, 20)) console.error(`  - ${item}`)
    if (metadataIssues.length > 20) console.error(`  ... 另有 ${metadataIssues.length - 20} 条`)
    process.exitCode = 1
  }
  await dataSource.destroy()
}

/**
 * `--check` 预演：不连库、不写库，只按同一套闸门把 seed 数据跑一遍，
 * 回答「真跑的时候会有多少条被拦下」。有违规时以退出码 1 结束，可挂 CI。
 */
if (process.argv.includes('--check')) {
  type SeedNode = {
    name: string
    codeBlocks: Array<{ language: string; code: string }>
    children: unknown[]
  }
  const flatten = (nodes: SeedNode[]): SeedNode[] =>
    nodes.flatMap((node) =>
      node.codeBlocks.length > 0 ? [node] : flatten((node.children as SeedNode[]) ?? []),
    )

  let total = 0
  const bad: string[] = []
  for (const category of PARSED) {
    for (const node of flatten((category.root.children as SeedNode[]) ?? [])) {
      const enrichList = ENRICH[`${category.name}:::${node.name}`] ?? []
      node.codeBlocks.forEach((_block, i) => {
        const enrich = enrichList[i]
        const title =
          enrich?.title || (node.codeBlocks.length > 1 ? `${node.name} ${i + 1}` : node.name)
        const issues = checkSnippetMetadata({ name: title, description: enrich?.description || '' })
        total++
        if (issues.length > 0) bad.push(`${title} → ${formatIssues(issues)}`)
      })
    }
  }

  console.log(`[check] 片段共 ${total} 条，闸门会拦下 ${bad.length} 条`)
  for (const b of bad.slice(0, 20)) console.error(`  - ${b}`)
  if (bad.length > 20) console.error(`  ... 另有 ${bad.length - 20} 条`)
  process.exit(bad.length > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('❌ seed 失败：', err)
  await dataSource.destroy()
  process.exit(1)
})
