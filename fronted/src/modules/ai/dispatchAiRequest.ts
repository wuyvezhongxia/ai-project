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
  const controller = new AbortController()
  const IDLE_TIMEOUT_MS = 45_000
  let idleTimer: number | null = null
  const resetIdleTimer = () => {
    if (idleTimer != null) window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
  }

  resetIdleTimer()
  const resp = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
    body: JSON.stringify({
      inputText: payload.inputText,
      ...(payload.bizId ? { bizId: payload.bizId } : {}),
    }),
  }).catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI 响应超时，请重试')
    }
    throw error
  })

  if (!resp.ok || !resp.body) {
    if (idleTimer != null) window.clearTimeout(idleTimer)
    throw new Error(`流式请求失败: ${resp.status}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''
  let model: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    resetIdleTimer()
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
        if (idleTimer != null) window.clearTimeout(idleTimer)
        const confirmText =
          (typeof typed.message === 'string' && typed.message.trim()
            ? typed.message
            : (typed.confirmationData as { message?: string } | undefined)?.message) || '需要确认操作'
        if (!output && confirmText) {
          output = confirmText
          payload.onChunk?.(confirmText, output)
        }
        payload.onConfirmationRequired?.({
          requiresConfirmation: true,
          confirmationData: typed.confirmationData,
          message: confirmText,
        })
        return { output, model, requiresConfirmation: true, confirmationData: typed.confirmationData }
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

  if (idleTimer != null) window.clearTimeout(idleTimer)

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
        inputText,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    case 'breakdown': {
      return streamAiChat({
        inputText,
        bizId: bizFromContext,
        onChunk: p.onStreamChunk,
        onConfirmationRequired: p.onConfirmationRequired,
      })
    }
    case 'batchAdjust': {
      return streamAiChat({
        inputText,
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

  const payload = (await resp.json().catch(() => null)) as
    | {
        code?: number
        message?: string
        data?: {
          output?: string
          metadata?: { model?: string }
          requiresConfirmation?: boolean
          confirmationData?: any
        }
      }
    | null

  if (!payload || payload.code !== 0 || !payload.data) {
    throw new Error(payload?.message || '确认响应格式异常')
  }

  return {
    output: payload.data.output || '操作已执行',
    model: payload.data.metadata?.model,
    requiresConfirmation: payload.data.requiresConfirmation,
    confirmationData: payload.data.confirmationData,
  }
}
