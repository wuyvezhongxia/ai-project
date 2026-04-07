/**
 * 与 LangChain 等框架中的「Chain」概念对齐的轻量约定：
 * 多步流程 = 若干 async 步骤顺序执行，每步输入输出边界清晰，便于单测与复用。
 *
 * - `chat/phases/`：主对话里与用户状态机强耦合的阶段（pending / guard / explicit）。
 * - `chains/`：与 HTTP 会话状态弱耦合、可单独调用的业务管线（如「拉数 → 拼模板 → 可选调模型」）。
 *
 * 不引入第三方 Chain 运行时；需要时可用下方 `pipe2`/`pipe3` 组合纯函数。
 */

export type AsyncFn<A, B> = (input: A) => Promise<B>;

export async function pipe2<A, B, C>(x: A, f: AsyncFn<A, B>, g: AsyncFn<B, C>): Promise<C> {
  return g(await f(x));
}

export async function pipe3<A, B, C, D>(x: A, f: AsyncFn<A, B>, g: AsyncFn<B, C>, h: AsyncFn<C, D>): Promise<D> {
  return h(await g(await f(x)));
}
