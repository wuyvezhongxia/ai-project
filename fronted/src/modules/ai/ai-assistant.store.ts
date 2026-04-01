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
      '你好，我是智能工作助手，可协助周报、任务拆解、风险与进度分析。在下方打开「工作上下文」并选择关联项目后，回答会更贴近你的实际数据；也可使用快捷技能一键开始。',
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
  setMaximized: (maximized) => set({ maximized }),
  toggleMaximized: () => set((s) => ({ maximized: !s.maximized })),
  setWorkContext: (workContext) => set({ workContext }),
  setDeepThink: (deepThink) => set({ deepThink }),
  setDefaultProjectId: (defaultProjectId) => set({ defaultProjectId }),
  appendMessages: (...items) => set((s) => ({ messages: [...s.messages, ...items] })),
  setMessages: (items) => set({ messages: items }),
  updateMessageContent: (id, updater) =>
    set((s) => ({
      messages: s.messages.map((item) => (item.id === id ? { ...item, content: updater(item.content) } : item)),
    })),
  resetChat: () => set({ messages: welcomeMessages(), lastModelLabel: null }),
  setLastModelLabel: (lastModelLabel) => set({ lastModelLabel }),
}))
