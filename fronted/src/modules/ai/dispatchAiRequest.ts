import { workspaceApi } from '../workspace/services/workspace.api'
import { classifyIntent, type AiIntent } from './aiIntent'

export type DispatchAiParams = {
  text: string
  intentOverride?: AiIntent
  workContext: boolean
  deepThink: boolean
  defaultProjectId: string
  selectedTaskId: string
}

type AiResult = { output: string; model?: string }

const withModel = (data: { output: string; metadata?: { model?: string } }): AiResult => ({
  output: data.output,
  model: data.metadata?.model,
})

export async function dispatchAiRequest(p: DispatchAiParams): Promise<AiResult> {
  const intent = p.intentOverride ?? classifyIntent(p.text)
  const inputText = p.deepThink ? `【请先逐步推理再给出结论】${p.text}` : p.text
  const bizFromContext =
    p.workContext && p.defaultProjectId && /^\d+$/.test(p.defaultProjectId) ? p.defaultProjectId : undefined

  switch (intent) {
    case 'weekly': {
      if (!p.defaultProjectId) {
        throw new Error('请先在面板顶部选择「关联项目」，再生成周报。')
      }
      const data = await workspaceApi.aiWeeklyReport({ bizId: p.defaultProjectId, inputText })
      return { output: data.output }
    }
    case 'breakdown': {
      const bizId = p.defaultProjectId && /^\d+$/.test(p.defaultProjectId) ? p.defaultProjectId : '1'
      const data = await workspaceApi.aiTaskBreakdown({ bizId, inputText })
      return { output: data.output }
    }
    case 'risk': {
      if (!p.selectedTaskId || !/^\d+$/.test(p.selectedTaskId)) {
        const data = await workspaceApi.aiChat({
          inputText,
          bizId: bizFromContext,
        })
        return withModel(data)
      }
      const data = await workspaceApi.aiRiskAnalysis({ bizId: p.selectedTaskId, inputText })
      return { output: data.output }
    }
    case 'progress': {
      if (!p.defaultProjectId) {
        throw new Error('请先在面板顶部选择「关联项目」，再查询项目进度。')
      }
      const data = await workspaceApi.aiProjectProgress({ bizId: p.defaultProjectId, inputText })
      return withModel(data)
    }
    case 'insight': {
      if (!p.selectedTaskId || !/^\d+$/.test(p.selectedTaskId)) {
        throw new Error('请先在任务列表中打开任务详情，再使用任务洞察。')
      }
      const data = await workspaceApi.aiTaskInsight({ bizId: p.selectedTaskId, inputText })
      return withModel(data)
    }
    default: {
      const data = await workspaceApi.aiChat({
        inputText,
        bizId: bizFromContext,
      })
      return withModel(data)
    }
  }
}
