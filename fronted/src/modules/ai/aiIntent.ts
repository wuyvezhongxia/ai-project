export type AiIntent = 'weekly' | 'breakdown' | 'batchAdjust' | 'insight' | 'chat'

export function classifyIntent(text: string): AiIntent {
  const t = text.trim()
  if (/(?:创建|新建|建立|添加|删除|移除|恢复|还原|查看|查询|标记|设为|改为|改成|完成).*(?:项目|任务|子任务)/i.test(t)) {
    return 'chat'
  }
  if (/周报|工作总结|工作周报|weekly\s*report|所有项目.*周报|全项目周报/i.test(t)) return 'weekly'
  if (/项目分析|拆解|分解|break\s*down/i.test(t)) return 'breakdown'
  if (/批量调整|批量改状态|批量修改任务状态/i.test(t)) return 'batchAdjust'
  if (/任务洞察|任务分析|insight/i.test(t)) return 'insight'
  return 'chat'
}
