export type AiIntent = 'weekly' | 'breakdown' | 'risk' | 'progress' | 'insight' | 'chat'

export function classifyIntent(text: string): AiIntent {
  const t = text.trim()
  if (/周报|工作总结|工作周报|weekly\s*report/i.test(t)) return 'weekly'
  if (/拆解|子任务|分解|break\s*down/i.test(t)) return 'breakdown'
  if (/延期风险|风险分析|风险评估/i.test(t)) return 'risk'
  if (/项目进度|进度总结|健康度|project\s*progress/i.test(t)) return 'progress'
  if (/任务洞察|任务分析|insight/i.test(t)) return 'insight'
  return 'chat'
}
