import { create } from 'zustand'

export type AiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const welcomeMessages = (): AiChatMessage[] => [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      '你好，我是智能工作助手，可协助周报、项目分析与批量调整。在下方打开「工作上下文」并选择关联项目后，回答会更贴近你的实际数据；也可使用快捷技能一键开始。',
  },
]

type AiAssistantState = {
  open: boolean
  maximized: boolean
  workContext: boolean
  deepThink: boolean
  defaultProjectId: string
  messages: AiChatMessage[]
  lastModelLabel: string | null
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setMaximized: (maximized: boolean) => void
  toggleMaximized: () => void
  setWorkContext: (workContext: boolean) => void
  setDeepThink: (deepThink: boolean) => void
  setDefaultProjectId: (id: string) => void
  appendMessages: (...items: AiChatMessage[]) => void
  setMessages: (items: AiChatMessage[]) => void
  updateMessageContent: (id: string, updater: (prev: string) => string) => void
  resetChat: () => void
  setLastModelLabel: (label: string | null) => void
}

export const useAiAssistantStore = create<AiAssistantState>((set) => ({
  open: false,
  maximized: false,
  workContext: true,
  deepThink: false,
  defaultProjectId: '',
  messages: welcomeMessages(),
  lastModelLabel: null,
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  // maximized 字段表示 AI 助手是否处于最大化（展开）状态，用于控制浮窗的显示大小
  setMaximized: (maximized) => set({ maximized }),
  toggleMaximized: () => set((s) => ({ maximized: !s.maximized })),
  // workContext 字段表示 AI 助手是否处于工作上下文模式，用于控制 AI 助手的行为
  setWorkContext: (workContext) => set({ workContext }),
  // deepThink 字段表示 AI 助手是否处于深度思考模式，用于控制 AI 助手的行为
  setDeepThink: (deepThink) => set({ deepThink }),
  // defaultProjectId 字段表示 AI 助手默认使用的项目 ID，用于控制 AI 助手的行为
  setDefaultProjectId: (defaultProjectId) => set({ defaultProjectId }),
  // appendMessages 函数用于追加消息到 AI 助手的消息列表
  appendMessages: (...items) => set((s) => ({ messages: [...s.messages, ...items] })),
  // setMessages 函数用于设置 AI 助手的消息列表
  setMessages: (items) => set({ messages: items }),
  // updateMessageContent 函数用于更新 AI 助手的消息内容
  updateMessageContent: (id, updater) =>
    set((s) => ({
      messages: s.messages.map((item) => (item.id === id ? { ...item, content: updater(item.content) } : item)),
    })),
  // resetChat 函数用于重置 AI 助手的消息列表
  resetChat: () => set({ messages: welcomeMessages(), lastModelLabel: null }),
  // setLastModelLabel 函数用于设置 AI 助手的最后使用的模型标签
  setLastModelLabel: (lastModelLabel) => set({ lastModelLabel }),
}))
