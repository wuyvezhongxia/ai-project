import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUpOutlined,
  BulbOutlined,
  CloseOutlined,
  CompressOutlined,
  CopyOutlined,
  DislikeOutlined,
  ExpandOutlined,
  HistoryOutlined,
  LikeOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { Button, Flex, Input, message, Modal, Select, Tooltip } from 'antd'
import { useQueryClient } from '@tanstack/react-query'

import { useAiAssistantStore } from './ai-assistant.store'
import { dispatchAiRequest, confirmAiAction } from './dispatchAiRequest'
import type { AiIntent } from './aiIntent'
import { useProjectOptionsQuery } from '../workspace/services/workspace.queries'
import { workspaceApi } from '../workspace/services/workspace.api'
import { useWorkspaceStore } from '../workspace/store/workspace-store'

const { TextArea } = Input

const QUICK_SKILLS: Array<{ key: string; label: string; intent: AiIntent; prompt: string }> = [
  { key: 'weekly', label: '生成周报', intent: 'weekly', prompt: '请为本项目生成本周工作周报草稿。' },
  { key: 'breakdown', label: '任务拆解', intent: 'breakdown', prompt: '请把当前重点任务拆解为可执行的子步骤。' },
  { key: 'risk', label: '延期风险', intent: 'risk', prompt: '请分析当前任务的延期风险并给出可执行建议。' },
  { key: 'progress', label: '项目进度', intent: 'progress', prompt: '请总结当前项目的进度、风险与下周建议。' },
]

type AiAssistantFloatingProps = {
  docked?: boolean
  fabOnly?: boolean
  hideFab?: boolean
}

type MessageFeedback = 'like' | 'dislike'

type ConfirmationDetail = {
  scopeLabel: string
  objectLabel: string
  primaryName: string
  secondaryName?: string
  tip?: string
}

type LocalAiThreadCache = {
  version: 1
  updatedAt: number
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
  lastModelLabel?: string | null
}

const AI_LOCAL_CACHE_PREFIX = 'pm-ai-thread-cache-v1'
const AI_LOCAL_CACHE_MAX_MESSAGES = 80

const buildThreadCacheKey = (bizId: string, useWorkContext: boolean) =>
  `${AI_LOCAL_CACHE_PREFIX}:${useWorkContext && bizId ? `project-${bizId}` : 'global'}`

const readThreadCache = (bizId: string, useWorkContext: boolean): LocalAiThreadCache | null => {
  try {
    const raw = localStorage.getItem(buildThreadCacheKey(bizId, useWorkContext))
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalAiThreadCache
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.messages)) return null
    return parsed
  } catch {
    return null
  }
}

const writeThreadCache = (
  bizId: string,
  useWorkContext: boolean,
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>,
  lastModelLabel?: string | null,
) => {
  try {
    const payload: LocalAiThreadCache = {
      version: 1,
      updatedAt: Date.now(),
      messages: messages.slice(-AI_LOCAL_CACHE_MAX_MESSAGES),
      lastModelLabel: lastModelLabel ?? null,
    }
    localStorage.setItem(buildThreadCacheKey(bizId, useWorkContext), JSON.stringify(payload))
  } catch {
    // localStorage 失败时静默降级，不影响主流程
  }
}

const renderMarkdownAsPlainText = (content: string) =>
  content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

function AiAssistantFloating({ docked = false, fabOnly = false, hideFab = false }: AiAssistantFloatingProps) {
  const threadRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef(false)
  const pendingStartedAtRef = useRef(0)
  const sentSinceOpenRef = useRef(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState('')
  const [messageFeedbackMap, setMessageFeedbackMap] = useState<Record<string, MessageFeedback | undefined>>({})
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [confirmationData, setConfirmationData] = useState<any>(null)
  const [confirmationAssistantId, setConfirmationAssistantId] = useState<string>('')
  const prevOpen = useRef(false)
  const queryClient = useQueryClient()

  const open = useAiAssistantStore((s) => s.open)
  const toggleOpen = useAiAssistantStore((s) => s.toggleOpen)
  const setOpen = useAiAssistantStore((s) => s.setOpen)
  const maximized = useAiAssistantStore((s) => s.maximized)
  const toggleMaximized = useAiAssistantStore((s) => s.toggleMaximized)
  const workContext = useAiAssistantStore((s) => s.workContext)
  const setWorkContext = useAiAssistantStore((s) => s.setWorkContext)
  const deepThink = useAiAssistantStore((s) => s.deepThink)
  const setDeepThink = useAiAssistantStore((s) => s.setDeepThink)
  const defaultProjectId = useAiAssistantStore((s) => s.defaultProjectId)
  const setDefaultProjectId = useAiAssistantStore((s) => s.setDefaultProjectId)
  const messages = useAiAssistantStore((s) => s.messages)
  const appendMessages = useAiAssistantStore((s) => s.appendMessages)
  const setMessages = useAiAssistantStore((s) => s.setMessages)
  const updateMessageContent = useAiAssistantStore((s) => s.updateMessageContent)
  const resetChat = useAiAssistantStore((s) => s.resetChat)
  const lastModelLabel = useAiAssistantStore((s) => s.lastModelLabel)
  const setLastModelLabel = useAiAssistantStore((s) => s.setLastModelLabel)

  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId)
  const detailOpen = useWorkspaceStore((s) => s.detailOpen)
  const closeTaskDetail = useWorkspaceStore((s) => s.closeTaskDetail)

  const { data: projectOptions = [], isSuccess: projectsLoaded } = useProjectOptionsQuery(!fabOnly)

  useEffect(() => {
    if (open && !prevOpen.current && projectsLoaded && projectOptions.length > 0 && !defaultProjectId) {
      setDefaultProjectId(projectOptions[0].value)
    }
    prevOpen.current = open
  }, [open, projectsLoaded, projectOptions, defaultProjectId, setDefaultProjectId])

  useEffect(() => {
    if (open) {
      sentSinceOpenRef.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    const cache = readThreadCache(defaultProjectId, workContext)
    if (cache?.messages?.length) {
      setMessages(cache.messages)
      if (cache.lastModelLabel) setLastModelLabel(cache.lastModelLabel)
    }

    const loadHistory = async () => {
      try {
        const response = await workspaceApi.aiHistory({
          bizId: workContext && defaultProjectId ? defaultProjectId : undefined,
          limit: 50,
        })
        if (!active) return

        const loaded = response.records.flatMap((record) => {
          const items: Array<{ id: string; role: 'user' | 'assistant'; content: string }> = []
          if (record.inputText?.trim()) {
            items.push({ id: `h-u-${record.id}`, role: 'user', content: record.inputText })
          }
          if (record.outputText?.trim()) {
            items.push({ id: `h-a-${record.id}`, role: 'assistant', content: record.outputText })
          }
          return items
        })

        if (loaded.length > 0) {
          // 若用户已在本次打开后发送消息，则不覆盖当前线程，避免“看起来没发出去”
          if (!sentSinceOpenRef.current) {
            setMessages(loaded)
          }
          writeThreadCache(defaultProjectId, workContext, loaded, lastModelLabel)
        } else {
          if (!cache?.messages?.length && !sentSinceOpenRef.current) {
            resetChat()
          }
        }
      } catch {
        // 历史加载失败时保留本地缓存会话，保证可用性
      }
    }

    void loadHistory()
    return () => {
      active = false
    }
  }, [open, workContext, defaultProjectId, setMessages, resetChat, setLastModelLabel])

  useEffect(() => {
    if (!open) return
    if (!messages.length) return
    writeThreadCache(defaultProjectId, workContext, messages, lastModelLabel)
  }, [open, defaultProjectId, workContext, messages, lastModelLabel])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = threadRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, open, scrollToBottom])

  const runSend = useCallback(
    async (text: string, intentOverride?: AiIntent) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (pendingRef.current) {
        const elapsed = Date.now() - (pendingStartedAtRef.current || 0)
        if (elapsed < 5000) {
          message.info('上一条消息仍在生成，请稍候...')
          return
        }
        pendingRef.current = false
        pendingStartedAtRef.current = 0
        setPending(false)
      }
      let waitingForConfirmation = false
      sentSinceOpenRef.current = true

      const assistantId = `a-${Date.now()}`
      const userMsg = { id: `u-${Date.now()}`, role: 'user' as const, content: trimmed }
      appendMessages(userMsg)
      appendMessages({ id: assistantId, role: 'assistant', content: '' })
      setInput('')
      pendingRef.current = true
      pendingStartedAtRef.current = Date.now()
      setPending(true)

      try {
        const result = await dispatchAiRequest({
          text: trimmed,
          intentOverride,
          workContext,
          deepThink,
          defaultProjectId,
          selectedTaskId: detailOpen ? selectedTaskId : '',
          onStreamChunk: (_chunk, full) => {
            updateMessageContent(assistantId, () => full)
          },
          onConfirmationRequired: (data) => {
            // 暂停当前请求，显示确认对话框
            setConfirmationData(data)
            setConfirmationAssistantId(assistantId)
            setConfirmationOpen(true)
            // 注意：这里不设置pending为false，因为请求仍在等待确认
          },
        })

        if (result.requiresConfirmation) {
          // 已经触发onConfirmationRequired回调，等待用户确认
          waitingForConfirmation = true
          return
        }

        if (result.model) setLastModelLabel(result.model)
        updateMessageContent(assistantId, () => result.output)
      } catch (err) {
        const msg = err instanceof Error ? err.message : '请求失败，请稍后重试'
        message.error(msg)
        updateMessageContent(assistantId, () => `暂时无法完成请求：${msg}`)
      } finally {
        if (!waitingForConfirmation) {
          pendingRef.current = false
          pendingStartedAtRef.current = 0
          setPending(false)
        }
      }
    },
    [appendMessages, deepThink, defaultProjectId, detailOpen, selectedTaskId, setLastModelLabel, updateMessageContent, workContext],
  )

  useEffect(() => {
    if (open) return
    pendingRef.current = false
    pendingStartedAtRef.current = 0
    setPending(false)
  }, [open])

  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => {
      pendingRef.current = false
      pendingStartedAtRef.current = 0
      setPending(false)
      message.warning('AI 响应较慢，已解除等待状态，你可以继续发送新消息。')
    }, 20_000)
    return () => window.clearTimeout(timer)
  }, [pending])

  // 处理确认操作
  const handleConfirm = async () => {
    if (!confirmationData || !confirmationAssistantId) return

    try {
      const action = confirmationData.confirmationData?.action || confirmationData.action
      const actionParams = confirmationData.confirmationData?.params || confirmationData.params
      const result = await confirmAiAction(
        action,
        actionParams
      )

      if (result.model) setLastModelLabel(result.model)
      updateMessageContent(confirmationAssistantId, () => result.output || '操作已执行')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['todo-list'] }),
        queryClient.invalidateQueries({ queryKey: ['todo-kanban'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['must-do-today'] }),
        queryClient.invalidateQueries({ queryKey: ['risk-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['project-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['project-stats'] }),
      ])
      if (action === 'deleteTask' && detailOpen && selectedTaskId && String(actionParams?.taskId || '') === selectedTaskId) {
        closeTaskDetail()
      }
      message.success('操作已确认并执行')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '确认操作失败'
      message.error(msg)
      updateMessageContent(confirmationAssistantId, () => `确认操作失败：${msg}`)
    } finally {
      // 清理确认状态
      setConfirmationOpen(false)
      setConfirmationData(null)
      setConfirmationAssistantId('')
      pendingRef.current = false
      setPending(false)
    }
  }

  // 取消确认操作
  const handleCancel = () => {
    if (confirmationAssistantId) {
      updateMessageContent(confirmationAssistantId, () => '操作已取消。')
    }
    setConfirmationOpen(false)
    setConfirmationData(null)
    setConfirmationAssistantId('')
    pendingRef.current = false
    setPending(false)
    message.info('操作已取消')
  }

  const onSend = () => runSend(input)

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const copyText = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((prev) => (prev === messageId ? '' : prev))
      }, 1200)
      message.success('已复制')
    } catch {
      message.error('复制失败')
    }
  }

  const toggleFeedback = (messageId: string, feedback: MessageFeedback) => {
    setMessageFeedbackMap((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === feedback ? undefined : feedback,
    }))
    if (feedback === 'like') {
      message.success('感谢反馈')
      return
    }
    message.info('已记录')
  }

  const panelClass = ['pm-ai-panel', maximized ? 'pm-ai-panel--max' : '', docked ? 'pm-ai-panel--dock' : '']
    .filter(Boolean)
    .join(' ')
  const lastMessageId = messages[messages.length - 1]?.id
  const confirmationParams = confirmationData?.confirmationData?.params || confirmationData?.params || {}
  const confirmationDetail: ConfirmationDetail = (() => {
    const action = confirmationData?.confirmationData?.action || confirmationData?.action || ''
    if (action === 'deleteTask') {
      return {
        scopeLabel: '任务模块',
        objectLabel: '任务',
        primaryName: confirmationParams.taskName || '未命名任务',
        secondaryName: confirmationParams.projectName ? `所属项目：${confirmationParams.projectName}` : undefined,
        tip: '删除后将无法恢复。',
      }
    }
    return {
      scopeLabel: '工作模块',
      objectLabel: '对象',
      primaryName: confirmationParams.taskName || confirmationParams.projectName || '待确认对象',
      tip: '请确认后再执行。',
    }
  })()

  return (
    <>
      {!hideFab && !open ? (
        <button
          type="button"
          className={`pm-ai-fab${open ? ' pm-ai-fab--active' : ''}`}
          aria-label={open ? '关闭智能工作助手' : '打开智能工作助手'}
          onClick={() => toggleOpen()}
        >
          <RobotOutlined />
        </button>
      ) : null}

      {open && !fabOnly ? (
        <div className={panelClass} role="dialog" aria-label="智能工作助手">
          <header className="pm-ai-header">
            <div className="pm-ai-header-brand">
              <div className="pm-ai-logo" aria-hidden>
                <RobotOutlined />
              </div>
              <div className="pm-ai-header-text">
                <div className="pm-ai-title">智能工作助手 · 精准协同</div>
                <div className="pm-ai-subtitle">
                  {lastModelLabel ? `${lastModelLabel} · 已连接` : '任务与项目数据协同'}
                </div>
              </div>
            </div>
            <div className="pm-ai-header-actions">
              <Tooltip title="历史记录（后续与账号同步）">
                <Button type="text" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)} />
              </Tooltip>
              <Tooltip title="新对话">
                <Button
                  type="text"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    resetChat()
                    message.success('已开始新对话')
                  }}
                />
              </Tooltip>
              <Tooltip title={maximized ? '还原' : '放大'}>
                <Button
                  type="text"
                  icon={maximized ? <CompressOutlined /> : <ExpandOutlined />}
                  onClick={() => toggleMaximized()}
                />
              </Tooltip>
              <Tooltip title="关闭">
                <Button type="text" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
              </Tooltip>
            </div>
          </header>

          {workContext && projectOptions.length > 1 ? (
            <div className="pm-ai-project-row">
              <span className="pm-ai-project-label">关联项目</span>
              <Select
                className="pm-ai-project-select"
                size="small"
                placeholder="选择项目（周报/进度需要）"
                allowClear
                options={projectOptions}
                value={defaultProjectId || undefined}
                onChange={(v) => setDefaultProjectId(v ?? '')}
              />
            </div>
          ) : null}

          <div className="pm-ai-thread" ref={threadRef}>
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'pm-ai-turn pm-ai-turn--user' : 'pm-ai-turn pm-ai-turn--bot'}>
                {m.role === 'user' ? (
                  <div className="pm-ai-bubble pm-ai-bubble--user">{m.content}</div>
                ) : (
                  <div className="pm-ai-bot-block">
                    {pending && m.id === lastMessageId && !m.content.trim() ? (
                      <div className="pm-ai-thinking" aria-live="polite">
                        <span className="pm-ai-thinking-text">正在思考</span>
                        <span className="pm-ai-thinking-dots" aria-hidden>
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="pm-ai-plain">{renderMarkdownAsPlainText(m.content)}</div>
                        <div className="pm-ai-feedback">
                          <button
                            type="button"
                            className={copiedMessageId === m.id ? 'pm-ai-icon-btn pm-ai-icon-btn--active' : 'pm-ai-icon-btn'}
                            aria-label="复制"
                            onClick={() => copyText(m.id, m.content)}
                          >
                            <CopyOutlined />
                          </button>
                          <button
                            type="button"
                            className={messageFeedbackMap[m.id] === 'like' ? 'pm-ai-icon-btn pm-ai-icon-btn--active' : 'pm-ai-icon-btn'}
                            aria-label="有用"
                            onClick={() => toggleFeedback(m.id, 'like')}
                          >
                            <LikeOutlined />
                          </button>
                          <button
                            type="button"
                            className={messageFeedbackMap[m.id] === 'dislike' ? 'pm-ai-icon-btn pm-ai-icon-btn--active' : 'pm-ai-icon-btn'}
                            aria-label="无用"
                            onClick={() => toggleFeedback(m.id, 'dislike')}
                          >
                            <DislikeOutlined />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Flex wrap="wrap" gap={8} className="pm-ai-quick">
            {QUICK_SKILLS.map((q) => (
              <button
                key={q.key}
                type="button"
                className="pm-ai-chip"
                onClick={() => {
                  if (q.intent === 'weekly' || q.intent === 'progress') {
                    if (!defaultProjectId) {
                      message.warning('请先选择关联项目')
                      return
                    }
                  }
                  void runSend(q.prompt, q.intent)
                }}
              >
                {q.label}
              </button>
            ))}
          </Flex>

          <div className="pm-ai-composer">
            <div className="pm-ai-composer-inner">
              <TextArea
                className="pm-ai-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="基于工作数据提问，Shift + Enter 换行"
                autoSize={{ minRows: 3, maxRows: 8 }}
              />
              <div className="pm-ai-composer-bar">
                <div className="pm-ai-toggles">
                  <button
                    type="button"
                    className={`pm-ai-pill${workContext ? ' pm-ai-pill--on' : ''}`}
                    onClick={() => setWorkContext(!workContext)}
                  >
                    <PaperClipOutlined />
                    工作上下文
                  </button>
                  <button
                    type="button"
                    className={`pm-ai-pill${deepThink ? ' pm-ai-pill--on' : ''}`}
                    onClick={() => setDeepThink(!deepThink)}
                  >
                    <BulbOutlined />
                    深度思考
                  </button>
                </div>
                <Tooltip title="发送">
                  <button
                    type="button"
                    className="pm-ai-send"
                    disabled={!input.trim()}
                    aria-label="发送"
                    onClick={() => onSend()}
                  >
                    <ArrowUpOutlined />
                  </button>
                </Tooltip>
              </div>
            </div>
            <p className="pm-ai-disclaimer">内容由 AI 生成，仅供参考</p>
          </div>
        </div>
      ) : null}

      <Modal title="对话历史" open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} destroyOnClose>
        <p className="pm-ai-muted">历史记录采用二级存储：服务端数据库为主存，浏览器本地缓存用于快速恢复与网络异常兜底。</p>
      </Modal>

      {/* 确认对话框 */}
      <Modal
        title="确认操作"
        open={confirmationOpen}
        onOk={handleConfirm}
        onCancel={handleCancel}
        okText="确认执行"
        cancelText="取消"
        destroyOnClose
      >
        {confirmationData ? (
          <div className="pm-ai-confirm">
            <p className="pm-ai-confirm-main">
              将在「{confirmationDetail.scopeLabel}」执行删除，目标{confirmationDetail.objectLabel}：{confirmationDetail.primaryName}
            </p>
            {confirmationDetail.secondaryName ? (
              <p className="pm-ai-confirm-sub">{confirmationDetail.secondaryName}</p>
            ) : null}
            <p className="pm-ai-confirm-tip">{confirmationDetail.tip || '确认后将立即执行。'}</p>
          </div>
        ) : (
          <p>加载确认信息...</p>
        )}
      </Modal>
    </>
  )
}

export default AiAssistantFloating
