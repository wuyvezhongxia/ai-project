import { getStoredToken } from '../../lib/http/api-client'
import { classifyIntent, type AiIntent } from './aiIntent'

export type DispatchAiParams = {
  text: string
  intentOverride?: AiIntent
  workContext: boolean
  deepThink: boolean
  defaultProjectId: string
  selectedTaskId: string
  onStreamChunk?: (chunk: string, full: string) => void
  onConfirmationRequired?: (data: any) => void
}

type AiResult = { output: string; model?: string; requiresConfirmation?: boolean; confirmationData?: any }

async function streamAiChat(payload: {
  inputText: string
  bizId?: string
  onChunk?: (chunk: string, full: string) => void
  onConfirmationRequired?: (data: any) => void
}): Promise<AiResult> {
  const token = getStoredToken()
  const resp = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      inputText: payload.inputText,
      ...(payload.bizId ? { bizId: payload.bizId } : {}),
    }),
  })

  if (!resp.ok || !resp.body) {
    throw new Error(`流式请求失败: ${resp.status}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''
  let model: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const event of events) {
      const line = event
        .split('\n')
        .find((item) => item.startsWith('data:'))
      if (!line) continue
      const raw = line.slice(5).trim()
      if (!raw) continue

      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        continue
      }

      if (typeof data !== 'object' || data == null) continue
      const typed = data as {
        type?: string;
        content?: string;
        model?: string;
        message?: string;
        requiresConfirmation?: boolean;
        confirmationData?: any;
      }

      if (typed.type === 'chunk' && typed.content) {
        output += typed.content
        payload.onChunk?.(typed.content, output)
      }

      if (typed.type === 'error') {
        throw new Error(typed.message || 'AI 流式响应失败')
      }

      if (typed.type === 'confirmation_required') {
        // 触发确认回调并提前返回
        payload.onConfirmationRequired?.({
          requiresConfirmation: true,
          confirmationData: typed.confirmationData,
          message: typed.message || '需要确认操作',
        });
        return { output, model, requiresConfirmation: true, confirmationData: typed.confirmationData };
      }

      if (typed.type === 'done') {
        model = typed.model ?? model
        if (!output && typed.content) {
          output = typed.content
          payload.onChunk?.(typed.content, output)
        }
      }
    }
  }

  if (!output.trim()) {
    throw new Error('AI 未返回有效内容，请检查模型配置或稍后重试')
  }

  return { output, model }
}

export async function dispatchAiRequest(p: DispatchAiParams): Promise<AiResult> {
  const intent = p.intentOverride ?? classifyIntent(p.text)
  const inputText = p.deepThink ? `【请先逐步推理再给出结论】${p.text}` : p.text
  const bizFromContext =
    p.workContext && p.defaultProjectId && /^\d+$/.test(p.defaultProjectId) ? p.defaultProjectId : undefined

  switch (intent) {
    case 'weekly': {
      return streamAiChat({
        inputText: `请以多轮对话方式帮我完成周报分析，并给出下一步问题：${inputText}`,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    case 'breakdown': {
      return streamAiChat({
        inputText: `请把任务拆解为可执行步骤，并标注风险点与下一步：${inputText}`,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    case 'risk': {
      const taskHint = p.selectedTaskId && /^\d+$/.test(p.selectedTaskId) ? `（任务ID: ${p.selectedTaskId}）` : ''
      return streamAiChat({
        inputText: `请做延期风险分析${taskHint}，并给出可执行预警建议：${inputText}`,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    case 'progress': {
      return streamAiChat({
        inputText: `请总结项目进度、风险和下周建议，并以对话方式继续追问我关键缺失信息：${inputText}`,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    case 'insight': {
      const taskHint = p.selectedTaskId && /^\d+$/.test(p.selectedTaskId) ? `（任务ID: ${p.selectedTaskId}）` : ''
      return streamAiChat({
        inputText: `请给出任务洞察${taskHint}，包括阻塞点、优先级和行动项：${inputText}`,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    default: {
      return streamAiChat({
        inputText,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
  }
}

/**
 * 确认AI操作
 */
export async function confirmAiAction(action: string, params: any): Promise<AiResult> {
  const token = getStoredToken()
  const resp = await fetch('/api/ai/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action,
      params,
    }),
  })

  if (!resp.ok) {
    const error = await resp.text().catch(() => '确认请求失败')
    throw new Error(`确认操作失败: ${resp.status} ${error}`)
  }

  const result = await resp.json()
  return result
}
